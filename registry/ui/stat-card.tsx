"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StatCardRarity = "common" | "rare" | "epic";

export type StatCardStat = {
  label: string;
  /** A whole number; it rolls up digit by digit. */
  value: number;
  /** What a full bar is worth. Without it the stat has no bar. */
  max?: number;
};

export type StatCardFact = { label: string; value: string };

export type StatCardProps = {
  /** Whose card it is. */
  name: string;
  /** What they do, on the line under the name and on the type line. */
  role?: string;
  /** Where they do it, on the type line. */
  team?: string;
  /** Their level. Raising it plays the level-up; lowering it only rolls down. */
  level: number;
  /** The numbers on the front, two to five reads best. */
  stats: StatCardStat[];
  /** A few sentences for the back. */
  bio?: string;
  /** Short facts listed on the back. */
  facts?: StatCardFact[];
  /** The card's number in its set, e.g. "042/300". */
  number?: string;
  /** The year they joined, e.g. "2021". */
  since?: string;
  /** A picture for the portrait window; without it, a monogram on a seeded pattern. */
  avatar?: React.ReactNode;
  /** Controlled: whether the back (the bio) is showing. */
  flipped?: boolean;
  /** Whether the card starts on its back when uncontrolled. @default false */
  defaultFlipped?: boolean;
  /** Fires from the drag, tap or key that turned the card over. */
  onFlippedChange?: (flipped: boolean) => void;
  /** The foil the card is edged in, and the colours of its portrait and bars. @default "rare" */
  rarity?: StatCardRarity;
  /** How far the card leans toward the pointer, in degrees, 0 to 20. @default 10 */
  tilt?: number;
  /** Roll the numbers up when the front is revealed. @default true */
  roll?: boolean;
  /** Play the flip and the level-up. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Palette = {
  label: string;
  /** The frame's foil, round the rim from the light. */
  foil: string[];
  /** How bright the glint gets, 0 to 1. */
  shine: number;
  /** The portrait's two background stops. */
  art: [string, string];
  /** The portrait's contour lines. */
  lines: string;
  /** Bars, the gem and the level-up's shine. */
  ink: string;
};

// Every foil is a token's hue at a fixed lightness, so a card is the same
// object on a light page and a dark one. Epic walks the hue wheel from the
// accent; the mixes toward white are in oklab, which keeps the hue.
const PALETTES: Record<StatCardRarity, Palette> = {
  common: {
    label: "Common",
    foil: [
      "oklch(from var(--ink-3) 0.86 0.008 h)",
      "oklch(from var(--ink-3) 0.64 0.012 h)",
      "oklch(from var(--ink-3) 0.8 0.01 h)",
      "oklch(from var(--ink-3) 0.58 0.014 h)",
    ],
    shine: 0.55,
    art: [
      "oklch(from var(--ink-3) 0.9 0.01 h)",
      "oklch(from var(--ink-3) 0.74 0.016 h)",
    ],
    lines: "oklch(from var(--ink-3) 0.56 0.02 h)",
    ink: "var(--ink-2)",
  },
  rare: {
    label: "Rare",
    foil: [
      "oklch(from var(--accent) 0.74 0.12 calc(h - 18))",
      "oklch(from var(--accent) 0.48 0.17 h)",
      "oklch(from var(--accent) 0.82 0.08 calc(h - 30))",
      "oklch(from var(--accent) 0.55 0.16 calc(h + 8))",
    ],
    shine: 0.7,
    art: [
      "oklch(from var(--accent) 0.86 0.06 calc(h - 20))",
      "oklch(from var(--accent) 0.62 0.13 h)",
    ],
    lines: "oklch(from var(--accent) 0.46 0.14 h)",
    ink: "var(--accent-bright)",
  },
  epic: {
    label: "Epic",
    foil: [
      "oklch(from var(--accent) 0.7 0.17 calc(h + 40))",
      "oklch(from var(--accent) 0.74 0.17 calc(h + 95))",
      "oklch(from var(--accent) 0.86 0.14 calc(h + 190))",
      "oklch(from var(--accent) 0.78 0.13 calc(h - 80))",
      "oklch(from var(--accent) 0.66 0.16 calc(h - 10))",
    ],
    shine: 0.85,
    art: [
      "oklch(from var(--accent) 0.84 0.09 calc(h + 70))",
      "oklch(from var(--accent) 0.58 0.17 calc(h + 30))",
    ],
    lines: "oklch(from var(--accent) 0.42 0.15 calc(h + 40))",
    ink: "oklch(from var(--accent) 0.6 0.19 calc(h + 40))",
  },
};

/** Where the light rests when nothing points at the card: the top left. */
const REST_LIGHT = -45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** True while the visitor has just pressed or typed: the page has user activation. */
const visitorActed = () =>
  typeof navigator !== "undefined" &&
  navigator.userActivation?.isActive === true;

const initialsOf = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const last =
    words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
};

/** The portrait's pattern: closed contours round a seeded centre, like a map. */
function contoursOf(seed: number): string[] {
  const rand = lcg(seed);
  const cx = 30 + rand() * 40;
  const cy = 22 + rand() * 16;
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const out: string[] = [];
  for (let k = 1; k <= 11; k += 1) {
    const base = k * 7.5;
    const pts: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      const r =
        base *
        (1 +
          0.13 * Math.sin(3 * a + p1 + k * 0.3) +
          0.07 * Math.sin(5 * a + p2));
      pts.push(
        `${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a) * 0.82)}`,
      );
    }
    out.push(`M ${pts.join(" L ")} Z`);
  }
  return out;
}

/** Twelve points round the rim, as fractions of the card, with their angle from the centre. */
const SPARKS = (() => {
  const rand = lcg(0x51a7c0de);
  const out: { left: string; top: string; angle: number; size: number }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const t = (i + rand() * 0.6) / 12;
    // Walk the rim clockwise from the top-left corner: 5 across, 7 down.
    const along = t * 24;
    let x: number;
    let y: number;
    // Kept off the rounded corners, where the rim curves away.
    const inner = (f: number, margin: number) => margin + f * (1 - 2 * margin);
    if (along < 5) [x, y] = [inner(along / 5, 0.12), 0];
    else if (along < 12) [x, y] = [1, inner((along - 5) / 7, 0.08)];
    else if (along < 17) [x, y] = [inner(1 - (along - 12) / 5, 0.12), 1];
    else [x, y] = [0, inner(1 - (along - 17) / 7, 0.08)];
    const angle = (Math.atan2((x - 0.5) * 5, -(y - 0.5) * 7) * 180) / Math.PI;
    const size = r2(8 + rand() * 4);
    // On the 6px rim, its tips just inside the card's edge.
    out.push({
      left: `calc(${r2(x * 100)}% - ${r2(x * size)}px)`,
      top: `calc(${r2(y * 100)}% - ${r2(y * size)}px)`,
      angle: r2(angle),
      size,
    });
  }
  return out;
})();

/** The spring the tilt follows the pointer on: glide's own constants. */
const FOLLOW = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
};

/** A digit column of an odometer: the lowest rolls freely, the rest on carry. */
function Digit({
  place,
  value,
}: {
  place: number;
  value: MotionValue<number>;
}) {
  const unit = 10 ** place;
  const y = useTransform(value, (raw) => {
    const v = Math.max(0, raw);
    let pos: number;
    if (place === 0) pos = v % 10;
    else {
      const base = Math.floor(v / unit) % 10;
      const carry = Math.max(0, (v % unit) - (unit - 1));
      pos = base + carry;
    }
    return `${-r3(pos)}em`;
  });
  // Leading zeros keep their width but not their ink.
  const opacity = useTransform(value, (v) =>
    place === 0 || v >= unit - 0.5 ? 1 : 0,
  );
  return (
    <motion.span
      className="relative inline-block h-[1em] w-[1ch] overflow-clip leading-none"
      style={{ opacity }}
    >
      <motion.span className="absolute inset-x-0 top-0 block" style={{ y }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, k) => (
          <span key={k} className="block h-[1em] text-center leading-none">
            {d}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

function Odometer({
  value,
  digits,
  className,
}: {
  value: MotionValue<number>;
  digits: number;
  className?: string;
}) {
  const parts: React.ReactNode[] = [];
  for (let place = digits - 1; place >= 0; place -= 1) {
    parts.push(<Digit key={place} place={place} value={value} />);
    if (place > 0 && place % 3 === 0) {
      parts.push(<Comma key={`c${place}`} place={place} value={value} />);
    }
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex font-mono leading-none tabular-nums",
        className,
      )}
    >
      {parts}
    </span>
  );
}

function Comma({
  place,
  value,
}: {
  place: number;
  value: MotionValue<number>;
}) {
  const opacity = useTransform(value, (v) => (v >= 10 ** place - 0.5 ? 1 : 0));
  return (
    <motion.span className="inline-block leading-none" style={{ opacity }}>
      ,
    </motion.span>
  );
}

const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * One stat: its odometer and its bar share one motion value, so the bar
 * fills as the digits roll. A reveal (`tick`) rolls up from zero; a new value
 * rolls from wherever the odometer is.
 */
function StatRow({
  stat,
  index,
  count,
  tick,
  rolling,
  ink,
}: {
  stat: StatCardStat;
  index: number;
  count: number;
  tick: number;
  rolling: boolean;
  ink: string;
}) {
  const target = Math.max(0, Math.round(stat.value));
  const value = useMotionValue(target);
  const rolled = React.useRef(-1);
  const max = stat.max && stat.max > 0 ? stat.max : null;
  const fill = useTransform(value, (v) =>
    max ? `${r2(clamp(v / max, 0, 1) * 100)}%` : "0%",
  );

  // Before its first reveal the odometer waits at zero, so it can roll up.
  React.useLayoutEffect(() => {
    if (rolling && tick === 0) value.set(0);
  }, [rolling, tick, value]);

  React.useEffect(() => {
    if (!rolling) {
      value.set(target);
      return;
    }
    if (tick === 0) return;
    const reveal = rolled.current !== tick;
    rolled.current = tick;
    if (reveal) value.set(0);
    // The drift spring settles without overshoot: a count never runs past
    // its number and comes back.
    const controls = animate(value, target, {
      ...springs.drift,
      delay: reveal ? 0.12 + index * cascade(count) : 0,
    });
    return () => controls.stop();
  }, [tick, target, rolling, index, count, value]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 truncate text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {stat.label}
        </dt>
        <dd className="shrink-0 text-[13px] text-foreground">
          <span className="sr-only">{grouped(target)}</span>
          <Odometer value={value} digits={String(target).length} />
        </dd>
      </div>
      {max ? (
        <div
          aria-hidden
          className="h-1 overflow-clip rounded-full bg-surface-2"
        >
          <motion.div
            className="h-full rounded-full"
            style={{ width: fill, background: ink }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Gem({ rarity, ink }: { rarity: StatCardRarity; ink: string }) {
  return (
    <svg
      aria-hidden
      width={10}
      height={10}
      viewBox="0 0 10 10"
      className="shrink-0"
    >
      {rarity === "common" ? (
        <circle cx={5} cy={5} r={3.6} style={{ fill: ink }} />
      ) : rarity === "rare" ? (
        <path d="M 5 0.6 L 9.4 5 L 5 9.4 L 0.6 5 Z" style={{ fill: ink }} />
      ) : (
        <path
          d="M 5 0.4 L 6.2 3.8 L 9.6 5 L 6.2 6.2 L 5 9.6 L 3.8 6.2 L 0.4 5 L 3.8 3.8 Z"
          style={{ fill: ink }}
        />
      )}
    </svg>
  );
}

/** A four-point sparkle on the epic rim; it flares as the glint passes it. */
function Spark({
  spark,
  light,
  glow,
  ink,
}: {
  spark: (typeof SPARKS)[number];
  light: MotionValue<number>;
  glow: MotionValue<number>;
  ink: string;
}) {
  const opacity = useTransform(
    [light, glow] as MotionValue<number>[],
    ([a = 0, g = 0]: number[]) => {
      const d = ((((spark.angle - a) % 360) + 540) % 360) - 180;
      const near = Math.max(0, Math.cos((d * Math.PI) / 180));
      return r3(Math.pow(near, 6) * clamp(0.35 + g, 0, 1));
    },
  );
  return (
    <motion.svg
      aria-hidden
      width={spark.size}
      height={spark.size}
      viewBox="0 0 10 10"
      className="pointer-events-none absolute"
      style={{ left: spark.left, top: spark.top, opacity }}
    >
      <path
        d="M 5 0 C 5.5 3.6 6.4 4.5 10 5 C 6.4 5.5 5.5 6.4 5 10 C 4.5 6.4 3.6 5.5 0 5 C 3.6 4.5 4.5 3.6 5 0 Z"
        fill="white"
        strokeWidth={0.8}
        style={{ stroke: ink }}
        strokeOpacity={0.55}
      />
    </motion.svg>
  );
}

type Said = { n: number; flipped: boolean; level: number; text: string };

type Api = {
  celebrate: (loud: boolean) => void;
  lower: () => void;
  showFace: (flipped: boolean) => void;
};

const faceOf = (angle: number) => Math.abs(Math.round(angle / 180)) % 2 === 1;

/**
 * A profile printed as a collectible card. Its rim is foil in the rarity's
 * colours — a conic gradient that turns with the light and carries a glint
 * where the light strikes it — and a mouse over the card tilts it toward
 * the pointer in perspective on springs that follow, so the glint runs round
 * the rim as the pointer circles. The numbers are odometers that roll up on
 * the drift spring, staggered, the first time the card is seen and whenever
 * its front comes back round.
 *
 * Drag it sideways and it turns over under the finger; a release projects
 * the throw and lands on the nearest face on the glide spring with the
 * release velocity (a hard flick spins it twice), and a tap flips it away
 * from the side pressed. Raising `level` sweeps a shine across the face and
 * lands the level badge on the recoil spring. The flip button on each face
 * is a real toggle; the face turned away is inert. Under reduced motion the
 * card stays flat, the faces cross-fade and the numbers simply show.
 */
export function StatCard({
  name,
  role,
  team,
  level,
  stats,
  bio,
  facts,
  number,
  since,
  avatar,
  flipped,
  defaultFlipped = false,
  onFlippedChange,
  rarity = "rare",
  tilt = 10,
  roll = true,
  sound = false,
  disabled = false,
  className,
}: StatCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const palette = PALETTES[rarity] ?? PALETTES.rare;
  const lean = clamp(tilt, 0, 30);
  const shownLevel = Math.max(0, Math.round(level));

  const [own, setOwn] = React.useState(defaultFlipped);
  const isFlipped = flipped ?? own;
  const [tick, setTick] = React.useState(0);
  const [check, setCheck] = React.useState(0);
  const rolling = roll && motionSafe;

  const [said, setSaid] = React.useState<Said>({
    n: 0,
    flipped: isFlipped,
    level: shownLevel,
    text: "",
  });
  if (said.flipped !== isFlipped || said.level !== shownLevel) {
    const text =
      said.flipped !== isFlipped
        ? isFlipped
          ? `Bio side: ${name}.`
          : `Stats side: ${name}, level ${shownLevel}.`
        : `Level ${shownLevel}.`;
    setSaid({ n: said.n + 1, flipped: isFlipped, level: shownLevel, text });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const frontButton = React.useRef<HTMLButtonElement | null>(null);
  const backButton = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const rest = React.useRef(isFlipped ? 180 : 0);
  const dragStart = React.useRef(0);
  const dragWidth = React.useRef(1);
  const dragging = React.useRef(false);
  const refocus = React.useRef(false);
  const seen = React.useRef(false);
  const levelWas = React.useRef(shownLevel);
  const api = React.useRef<Api | null>(null);

  const turn = useMotionValue(motionSafe && isFlipped ? 180 : 0);
  const mix = useMotionValue(isFlipped ? 1 : 0);
  const aimX = useMotionValue(0);
  const aimY = useMotionValue(0);
  const aimLight = useMotionValue(REST_LIGHT);
  const aimGlow = useMotionValue(0);
  const tiltX = useSpring(aimX, FOLLOW);
  const tiltY = useSpring(aimY, FOLLOW);
  const light = useSpring(aimLight, FOLLOW);
  const glow = useSpring(aimGlow, FOLLOW);
  const flare = useMotionValue(0);
  const sweep = useMotionValue(0);
  const sweepOn = useMotionValue(0);
  const badge = useMotionValue(1);
  const levelValue = useMotionValue(shownLevel);

  const frame = useTransform(
    [light, glow, flare] as MotionValue<number>[],
    ([a = REST_LIGHT, g = 0, f = 0]: number[]) => {
      const n = palette.foil.length;
      const stops = [...palette.foil, palette.foil[0]]
        .map((c, i) => `${c} ${r2((i / n) * 360)}deg`)
        .join(", ");
      const strength = clamp(
        (0.22 + 0.78 * g) * palette.shine + f * 0.45,
        0,
        0.92,
      );
      const core = `color-mix(in oklab, white ${Math.round(strength * 100)}%, transparent)`;
      const soft = `color-mix(in oklab, white ${Math.round(strength * 45)}%, transparent)`;
      // A bright core inside a softer halo: the rim reads as polished foil
      // catching one light, not as a stripe painted on it.
      return `conic-gradient(from ${r2(a - 40)}deg, transparent 0deg, ${soft} 22deg, ${core} 40deg, ${soft} 58deg, transparent 80deg, transparent 360deg), conic-gradient(from ${r2(a * 0.6)}deg, ${stops})`;
    },
  );
  const frontOpacity = useTransform(mix, (m) => r3(1 - m));
  const backOpacity = useTransform(mix, (m) => r3(m));
  const sweepX = useTransform(sweep, (s) => `${r2(-130 + s * 260)}%`);
  const flareRing = useTransform(flare, (f) => r3(f));

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
    return controls;
  };
  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  const pan = () => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  /** The card comes to rest at `target` degrees, landing with a pop. */
  const land = (target: number, velocity = 0, loud = true) => {
    const from = turn.get();
    const was = rest.current;
    rest.current = target;
    if (!motionSafe) {
      anims.current.get("turn")?.stop();
      turn.set(0);
      run(
        "mix",
        animate(mix, faceOf(target) ? 1 : 0, {
          duration: durations.base,
          ease: easings.move,
        }),
      );
      if (loud && faceOf(target) !== faceOf(was)) {
        audio.play("pop", {
          pitch: faceOf(target) ? 0.92 : 1.08,
          gain: 0.5,
          pan: pan(),
        });
      }
      return;
    }
    let popped = !loud || Math.abs(target - from) < 90;
    run(
      "turn",
      animate(turn, target, {
        ...springs.glide,
        velocity,
        onUpdate: (v) => {
          if (popped || Math.abs(v - target) > 14) return;
          popped = true;
          audio.play("pop", {
            pitch: faceOf(target) ? 0.92 : 1.08,
            gain: 0.5,
            pan: pan(),
          });
        },
      }),
    );
  };

  /** The visitor turned the card: report the new face from the gesture. */
  const commit = (target: number, velocity = 0) => {
    const next = faceOf(target);
    if (next === isFlipped) {
      land(target, velocity);
      return;
    }
    land(target, velocity);
    if (flipped === undefined) setOwn(next);
    else React.startTransition(() => setCheck((c) => c + 1));
    onFlippedChange?.(next);
    // Coming back round to the front is a reveal: the numbers roll again.
    if (!next) setTick((t) => t + 1);
  };

  const flip = (direction: 1 | -1) => {
    if (disabled) return;
    commit(rest.current + 180 * direction);
  };

  const celebrate = (loud: boolean) => {
    if (!motionSafe) {
      levelValue.set(shownLevel);
      flare.set(1);
      run(
        "flare",
        animate(flare, 0, { duration: durations.page, ease: easings.linear }),
      );
      return;
    }
    run("level", animate(levelValue, shownLevel, springs.snap));
    sweep.set(0);
    sweepOn.set(1);
    run(
      "sweep",
      animate(sweep, 1, {
        duration: durations.page,
        ease: easings.move,
        onComplete: () => sweepOn.set(0),
      }),
    );
    flare.set(1);
    run("flare", animate(flare, 0, { duration: 0.9, ease: easings.enter }));
    if (loud) audio.play("shimmer", { gain: 0.45, pan: pan() });
    later(260, () => {
      badge.set(1.3);
      run("badge", animate(badge, 1, springs.recoil));
      if (loud) audio.play("pop", { pitch: 1.2, gain: 0.55, pan: pan() });
    });
  };

  const lower = () => {
    if (motionSafe) run("level", animate(levelValue, shownLevel, springs.snap));
    else levelValue.set(shownLevel);
  };

  /** The host says which face: the card turns there without a sound. */
  const showFace = (face: boolean) => {
    if (faceOf(rest.current) === face) return;
    land(rest.current + 180, 0, false);
    if (!face) setTick((t) => t + 1);
  };

  React.useEffect(() => {
    api.current = { celebrate, lower, showFace };
  });

  // The host's word on the face wins: a refusal turns the card back, a
  // change from outside turns it over.
  React.useEffect(() => {
    if (dragging.current) return;
    api.current?.showFace(isFlipped);
  }, [isFlipped, check]);

  // A level that rises celebrates; one that falls only rolls down, because
  // losing standing never celebrates. It is heard only when it answers the
  // visitor.
  React.useEffect(() => {
    const from = levelWas.current;
    levelWas.current = shownLevel;
    if (shownLevel === from) return;
    if (shownLevel > from) api.current?.celebrate(visitorActed());
    else api.current?.lower();
  }, [shownLevel]);

  // Reduced motion changes how a face is shown: turned, or cross-faded.
  React.useEffect(() => {
    const face = faceOf(rest.current);
    turn.set(motionSafe ? rest.current : 0);
    mix.set(motionSafe ? 0 : face ? 1 : 0);
  }, [motionSafe, turn, mix]);

  // Focus that was on the flip button goes to the other face's button once
  // that face is live (the face turned away is inert).
  React.useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (isFlipped ? backButton : frontButton).current?.focus({
      preventScroll: true,
    });
  }, [isFlipped]);

  // The first time the card is on screen, its numbers roll up.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry?.isIntersecting || seen.current) return;
      seen.current = true;
      setTick((t) => t + 1);
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    const waiting = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of waiting) window.clearTimeout(t);
      waiting.clear();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled,
    onStart: () => {
      dragging.current = true;
      anims.current.get("turn")?.stop();
      dragStart.current = turn.get();
      dragWidth.current = Math.max(1, rootRef.current?.offsetWidth ?? 1);
    },
    onMove: ({ offset }) => {
      if (!motionSafe) return;
      turn.set(
        r2(dragStart.current + (offset.x / (dragWidth.current * 0.8)) * 180),
      );
    },
    onEnd: ({ offset, velocity }) => {
      dragging.current = false;
      if (!motionSafe) {
        if (Math.abs(offset.x) > 40) flip(offset.x > 0 ? 1 : -1);
        return;
      }
      const perPx = 180 / (dragWidth.current * 0.8);
      const landing = project(turn.get(), velocity.x * perPx, 0.99);
      const k = clamp(
        Math.round(landing / 180),
        rest.current / 180 - 2,
        rest.current / 180 + 2,
      );
      commit(k * 180, velocity.x * perPx);
    },
    onCancel: () => {
      dragging.current = false;
      land(rest.current, 0, false);
    },
    onTap: (event) => {
      const r = rootRef.current?.getBoundingClientRect();
      flip(r && event.clientX < r.left + r.width / 2 ? -1 : 1);
    },
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || !motionSafe || disabled) return;
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width < 1) return;
    const nx = clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const ny = clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    aimX.set(r2(ny * lean));
    aimY.set(r2(-nx * lean));
    // The light angle is unwrapped onto the side nearest where it is, so the
    // glint never spins the long way round.
    const a = (Math.atan2(nx, -ny) * 180) / Math.PI;
    const now = aimLight.get();
    aimLight.set(r2(now + ((((a - now) % 360) + 540) % 360) - 180));
    aimGlow.set(r3(Math.min(1, Math.hypot(nx, ny))));
  };
  const onPointerLeave = () => {
    aimX.set(0);
    aimY.set(0);
    aimGlow.set(0);
    const now = aimLight.get();
    aimLight.set(r2(now + ((((REST_LIGHT - now) % 360) + 540) % 360) - 180));
  };

  const contours = React.useMemo(() => contoursOf(hash(name)), [name]);
  const initials = initialsOf(name);
  const typeLine = [role, team].filter(Boolean).join(" · ");
  const footer = [
    number ? `No. ${number}` : null,
    since ? `Since ${since}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const flipButton = (side: "front" | "back") => (
    <button
      ref={side === "front" ? frontButton : backButton}
      type="button"
      aria-label="Show the bio"
      aria-pressed={isFlipped}
      disabled={disabled}
      onClick={(event) => {
        // Pointer presses arrive through the card's tap. Space, Enter and
        // assistive technology click with no pointer, and flip it the same
        // way every time.
        if (event.detail !== 0) return;
        refocus.current = true;
        flip(1);
      }}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-surface-2 text-ink-2 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:text-foreground",
      )}
    >
      <svg aria-hidden width={14} height={14} viewBox="0 0 16 16" fill="none">
        <path
          d="M 3 6.5 A 5 5 0 0 1 12.6 5 M 13 9.5 A 5 5 0 0 1 3.4 11"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path
          d="M 12.9 2.4 L 12.8 5.3 L 9.9 5.1 M 3.1 13.6 L 3.2 10.7 L 6.1 10.9"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const sweepLayer = (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 block"
      style={{ opacity: sweepOn }}
    >
      <motion.span
        className="absolute inset-y-0 left-0 block w-full"
        style={{
          x: sweepX,
          background: `linear-gradient(105deg, transparent 30%, color-mix(in oklab, ${palette.ink} 34%, transparent) 44%, color-mix(in oklab, white 70%, transparent) 50%, color-mix(in oklab, ${palette.ink} 34%, transparent) 56%, transparent 70%)`,
        }}
      />
    </motion.span>
  );

  const faceClass =
    "absolute inset-0 rounded-4 p-1.5 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";
  const innerClass =
    "relative flex h-full flex-col overflow-clip rounded-3 border border-hairline bg-card text-left";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Profile card: ${name}`}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn(
        "relative w-full max-w-[19.75rem] px-2.5 py-3 select-none [perspective:1000px]",
        disabled && "opacity-50",
        className,
      )}
    >
      <motion.div
        className="relative aspect-[5/7] w-full [transform-style:preserve-3d]"
        style={{ rotateX: tiltX, rotateY: tiltY }}
      >
        <motion.div
          {...drag}
          className={cn(
            "absolute inset-0 touch-pan-y [transform-style:preserve-3d]",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
          style={{ rotateY: turn }}
        >
          {/* Front: who, a portrait, the numbers. */}
          <motion.div
            className={faceClass}
            aria-hidden={isFlipped || undefined}
            inert={isFlipped}
            style={{
              background: frame,
              opacity: motionSafe ? 1 : frontOpacity,
            }}
          >
            {rarity === "epic"
              ? SPARKS.map((spark, i) => (
                  <Spark
                    key={i}
                    spark={spark}
                    light={light}
                    glow={glow}
                    ink={palette.ink}
                  />
                ))
              : null}
            <div className={innerClass}>
              <div className="flex items-center gap-3 px-3 pt-2.5">
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[15px] leading-5 font-semibold text-foreground"
                    title={name}
                  >
                    {name}
                  </p>
                  {role ? (
                    <p
                      className="truncate text-[11px] leading-4 text-ink-3"
                      title={role}
                    >
                      {role}
                    </p>
                  ) : null}
                </div>
                <motion.div
                  className="relative grid size-11 shrink-0 place-items-center rounded-full p-[3px]"
                  style={{ background: frame, scale: badge }}
                >
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      opacity: flareRing,
                      boxShadow: `0 0 0 3px color-mix(in oklab, ${palette.ink} 45%, transparent)`,
                    }}
                  />
                  <span className="flex size-full flex-col items-center justify-center rounded-full bg-card">
                    <span className="text-[9px] leading-none font-semibold tracking-[0.1em] text-ink-3">
                      LV
                    </span>
                    <span className="sr-only">Level {shownLevel}</span>
                    <Odometer
                      value={levelValue}
                      digits={Math.max(1, String(shownLevel).length)}
                      className="mt-0.5 text-[15px] font-semibold text-foreground"
                    />
                  </span>
                </motion.div>
              </div>

              <div
                className="relative mx-2.5 mt-2 flex flex-1 items-center justify-center overflow-clip rounded-2"
                style={{
                  background: `linear-gradient(160deg, ${palette.art[0]}, ${palette.art[1]})`,
                }}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 100 60"
                  preserveAspectRatio="xMidYMid slice"
                  className="absolute inset-0 size-full"
                >
                  <g
                    fill="none"
                    strokeWidth={0.5}
                    style={{ stroke: palette.lines }}
                    opacity={0.55}
                  >
                    {contours.map((d, i) => (
                      <path key={i} d={d} />
                    ))}
                  </g>
                </svg>
                <span
                  className="relative grid size-20 place-items-center overflow-clip rounded-full border-2 bg-card text-2xl font-semibold tracking-[0.04em] text-foreground"
                  style={{ borderColor: palette.ink }}
                >
                  {avatar ?? <span aria-hidden>{initials}</span>}
                </span>
              </div>

              <div className="mx-2.5 mt-2 flex h-6 items-center justify-between gap-2 rounded-1 bg-surface-2 px-2 text-[11px] text-ink-2">
                <span className="min-w-0 truncate" title={typeLine}>
                  {typeLine}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Gem rarity={rarity} ink={palette.ink} />
                  {palette.label}
                </span>
              </div>

              <dl className="mt-2.5 flex flex-col gap-2 px-3">
                {stats.map((stat, i) => (
                  <StatRow
                    key={stat.label}
                    stat={stat}
                    index={i}
                    count={stats.length}
                    tick={tick}
                    rolling={rolling}
                    ink={palette.ink}
                  />
                ))}
              </dl>

              <div className="mt-2.5 flex items-center justify-between gap-2 px-3 pb-2.5">
                <span className="min-w-0 truncate font-mono text-[10px] text-ink-3">
                  {footer}
                </span>
                {flipButton("front")}
              </div>
              {sweepLayer}
            </div>
          </motion.div>

          {/* Back: the bio. */}
          <motion.div
            className={faceClass}
            aria-hidden={!isFlipped || undefined}
            inert={!isFlipped}
            style={{
              background: frame,
              opacity: motionSafe ? 1 : backOpacity,
              rotateY: motionSafe ? 180 : 0,
            }}
          >
            <div className={innerClass}>
              <div className="px-3 pt-2.5">
                <p className="text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  About
                </p>
                <p
                  className="truncate text-[15px] leading-5 font-semibold text-foreground"
                  title={name}
                >
                  {name}
                </p>
              </div>
              {bio ? (
                <p className="mt-2 line-clamp-6 px-3 text-xs leading-5 text-ink-2">
                  {bio}
                </p>
              ) : null}
              {facts && facts.length > 0 ? (
                <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-3 text-[11px] leading-4">
                  {facts.map((fact) => (
                    <React.Fragment key={fact.label}>
                      <dt className="text-ink-3">{fact.label}</dt>
                      <dd
                        className="truncate text-foreground"
                        title={fact.value}
                      >
                        {fact.value}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              ) : null}
              <div
                aria-hidden
                className="relative mx-2.5 mt-3 flex-1 overflow-clip rounded-2"
                style={{
                  background: `linear-gradient(200deg, ${palette.art[0]}, ${palette.art[1]})`,
                }}
              >
                <svg
                  viewBox="0 0 100 60"
                  preserveAspectRatio="xMidYMid slice"
                  className="absolute inset-0 size-full"
                >
                  <g
                    fill="none"
                    strokeWidth={0.5}
                    style={{ stroke: palette.lines }}
                    opacity={0.45}
                  >
                    {contours.map((d, i) => (
                      <path key={i} d={d} transform="rotate(180 50 30)" />
                    ))}
                  </g>
                </svg>
                <span className="absolute inset-0 grid place-items-center">
                  <Gem rarity={rarity} ink="var(--card)" />
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2 px-3 pb-2.5">
                <span className="min-w-0 truncate font-mono text-[10px] text-ink-3">
                  {palette.label}
                  {footer ? ` · ${footer}` : ""}
                </span>
                {flipButton("back")}
              </div>
              {sweepLayer}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
