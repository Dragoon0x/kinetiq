"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BeatLikeTone = "rose" | "amber" | "cobalt" | "mint";
export type BeatLikeSize = "sm" | "md" | "lg";
export type BeatLikeKind = "like" | "super" | "unlike";
export type BeatLikeHold = "idle" | "charging" | "full";

export type BeatLikeProps = {
  /** Controlled: whether the visitor has liked it. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press, key or hold that changed it, with the new state and how it was reached. */
  onPressedChange?: (pressed: boolean, kind: BeatLikeKind) => void;
  /** Likes from everyone else; the visitor's own like is added while pressed. @default 0 */
  count?: number;
  /** How the count is written. @default a grouped integer, "1,284" */
  format?: (count: number) => string;
  /** The button's accessible name. @default "Like" */
  label?: string;
  /** Small hearts thrown by a like; a super-like throws twice as many in two rings. 0 to 24. @default 8 */
  burst?: number;
  /** The heart rate in beats per minute: how fast a beat contracts and relaxes, the resting pulse, and where a held heart starts to race. @default 72 */
  beat?: number;
  /** The heart's colour: a named pigment, or any CSS colour. @default "rose" */
  color?: BeatLikeTone | (string & {});
  /** Keep a quiet resting heartbeat while liked (only while on screen). @default true */
  resting?: boolean;
  /** Holding the heart races it, and letting go at full charge super-likes. @default true */
  holdToSuper?: boolean;
  /** How long a hold takes to reach full charge, in ms. @default 1200 */
  superHold?: number;
  /** Fires as a hold starts charging, reaches full charge, and ends. */
  onHoldChange?: (state: BeatLikeHold) => void;
  /** Show the count beside the heart. Off: a round heart button. @default true */
  showCount?: boolean;
  /** @default "md" */
  size?: BeatLikeSize;
  /** Play the pops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  /** Pill height. */
  pill: number;
  /** The heart's drawn size. */
  heart: number;
  /** Inline padding before the heart. */
  padX: number;
  text: string;
  gap: string;
};

const GEOMETRY: Record<BeatLikeSize, Geometry> = {
  sm: { pill: 32, heart: 18, padX: 7, text: "text-xs", gap: "gap-1.5" },
  md: { pill: 40, heart: 22, padX: 9, text: "text-sm", gap: "gap-2" },
  lg: { pill: 48, heart: 28, padX: 10, text: "text-base", gap: "gap-2.5" },
};

/**
 * Pigments, not text colours: a filled heart reads the same on a light page
 * as on a dark one, so each takes its token's hue at a fixed lightness.
 */
const TONES: Record<BeatLikeTone, string> = {
  rose: "oklch(from var(--danger) 0.66 0.2 h)",
  amber: "oklch(from var(--warn) 0.79 0.15 h)",
  cobalt: "oklch(from var(--accent-bright) 0.62 0.19 h)",
  mint: "oklch(from var(--success) 0.74 0.14 h)",
};

/**
 * The heart, in a 24-unit box centred on the origin: two lobes meeting in a
 * cleft, sides that swing down to a soft tip. Drawn once and scaled for the
 * small hearts too.
 */
const HEART =
  "M0 9C-3 6.2-10 1.6-10-3.2C-10-6.6-7.6-9-4.9-9C-2.8-9-1-7.8 0-5.9C1-7.8 2.8-9 4.9-9C7.6-9 10-6.6 10-3.2C10 1.6 3 6.2 0 9Z";

/** Where each pool of hearts reaches, in heart sizes from the centre. */
const REACH = 1.35;
const SUPER_REACH = 1.85;
/** The farthest a spark rests, as a share of its ring's reach. */
const FAR = 1.05;
/** The longest a hand may rest before a press becomes a hold, in ms. */
const HOLD_DELAY = 280;
const MAX_BURST = 24;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** A small integer hash folded to [0, 1): the same ring on every render. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x7f4a, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The clock, read only from handlers and timers. */
const now = () => performance.now();

/**
 * Sound waits for a real activation — a click, tap or key — never a hover or
 * a first touch-down. Browsers without the API are taken at their word.
 */
const activated = () => {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator as Navigator & { userActivation?: UserActivation })
    .userActivation;
  return ua ? ua.hasBeenActive : true;
};

/** "1284" → "1,284", by hand so the server and every browser agree. */
const group = (n: number) =>
  String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type Spark = {
  angle: number;
  /** Where it comes to rest, as a share of the ring's reach. */
  dist: number;
  /** Its size, as a scale of the heart path (24 units). */
  size: number;
  spin: number;
  /** A lighter heart every so often, so the ring is not a stamp. */
  light: boolean;
  /** How late it leaves, as a share of the ring's time. */
  lag: number;
};

function sparks(n: number, ring: number): Spark[] {
  const out: Spark[] = [];
  const step = (Math.PI * 2) / Math.max(1, n);
  for (let k = 0; k < n; k += 1) {
    const a = hash(k, ring * 31 + 1);
    const b = hash(k, ring * 31 + 2);
    const c = hash(k, ring * 31 + 3);
    out.push({
      angle: -Math.PI / 2 + (k + ring * 0.5) * step + (a - 0.5) * step * 0.45,
      dist: 0.8 + b * (FAR - 0.8),
      size: (ring ? 0.33 : 0.29) + c * 0.14,
      spin: (a - 0.5) * 50,
      light: (k + ring) % 3 === 1,
      lag: b * 0.12,
    });
  }
  return out;
}

type ParticleProps = {
  t: MotionValue<number>;
  spark: Spark;
  /** Distance from the heart's centre at which the heart leaves, px. */
  from: number;
  /** The ring's reach, px. */
  reach: number;
  still: boolean;
};

/** One small heart, placed every frame from its ring's progress. */
function Particle({ t, spark, from, reach, still }: ParticleProps) {
  const local = (v: number) =>
    clamp01((v - spark.lag) / Math.max(0.01, 1 - spark.lag));
  const to = reach * spark.dist;
  // Leaves fast and coasts to rest: the beat pushed it, nothing pulls it on.
  const dist = (v: number) => {
    if (still) return from + (to - from) * 0.78;
    const u = local(v);
    return from + (to - from) * (1 - Math.pow(1 - u, 3));
  };
  const x = useTransform(t, (v) => r2(Math.cos(spark.angle) * dist(v)));
  const y = useTransform(t, (v) => r2(Math.sin(spark.angle) * dist(v)));
  const scale = useTransform(t, (v) => {
    if (still) return spark.size;
    const u = local(v);
    const grow = u < 0.3 ? u / 0.3 : 1 - ((u - 0.3) / 0.7) * 0.55;
    return r2(spark.size * grow);
  });
  const rotate = useTransform(t, (v) =>
    still ? 0 : r2(spark.spin * local(v)),
  );
  const opacity = useTransform(t, (v) => {
    const u = local(v);
    if (u <= 0 || u >= 1) return 0;
    const fade = still
      ? u < 0.2
        ? u / 0.2
        : (1 - u) / 0.8
      : u < 0.55
        ? 1
        : (1 - u) / 0.45;
    return r2(clamp01(fade));
  });
  return (
    <motion.path
      d={HEART}
      className={
        spark.light
          ? "fill-[color-mix(in_oklab,var(--beat-like-color)_55%,white)]"
          : "fill-[var(--beat-like-color)]"
      }
      style={{
        x,
        y,
        scale,
        rotate,
        opacity,
        originX: 0.5,
        originY: 0.5,
      }}
    />
  );
}

type RollProps = { text: string; motionSafe: boolean };

/**
 * The count, one column per character keyed from the right, so the units
 * keep their column as the number grows; digits roll on snap, separators
 * stand still. Line height is set inline: the geometry depends on it.
 */
function Roll({ text, motionSafe }: RollProps) {
  const chars = Array.from(text);
  return (
    <span aria-hidden className="inline-flex font-mono tabular-nums">
      {chars.map((ch, i) => {
        const key = chars.length - i;
        const digit = ch.charCodeAt(0) - 48;
        if (digit < 0 || digit > 9) {
          return (
            <span key={`s${key}`} style={{ lineHeight: "1.25em" }}>
              {ch}
            </span>
          );
        }
        return (
          <span
            key={`d${key}`}
            className="relative inline-block overflow-hidden"
            style={{ height: "1.25em", lineHeight: "1.25em" }}
          >
            <span className="invisible">0</span>
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${-digit * 1.25}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {"0123456789".split("").map((d) => (
                <span key={d} style={{ height: "1.25em" }}>
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type Hold = {
  source: "pointer" | "key" | null;
  pointerId: number;
  phase: "pressing" | "charging";
  /** now() when the charge began. */
  start: number;
  full: boolean;
  cancelled: boolean;
};

type Api = {
  restBeat: () => void;
  show: (next: boolean, kind: BeatLikeKind, voiced: boolean) => void;
  cancel: () => void;
};

/**
 * A like button with a heart that beats. Pressed, the heart contracts on a
 * fast spring while the colour floods up from its tip, then relaxes on an
 * underdamped one that carries it past its size, and at the top of that
 * relaxation it throws a ring of small hearts outward and the count rolls.
 * While liked it keeps a quiet resting heartbeat at `beat` beats a minute.
 *
 * Holding the heart makes it race: it beats on its own, quicker and bigger
 * with every beat, while a ring around it fills; let go at full charge and it
 * super-likes with one big beat and a double ring. Let go sooner and it is an
 * ordinary like; slide off, or press Escape, and it calms down.
 *
 * It is a real `aria-pressed` button. Space and Enter behave like the pointer —
 * a quick press toggles, a held one charges — and a click with no pointer or
 * key behind it toggles. Under reduced motion nothing contracts or flies: the
 * colour fills and drains on a short tween, the ring of hearts appears still
 * and fades, and the charge shows as the ring filling, because liked and not
 * liked are information.
 */
export function BeatLike({
  pressed,
  defaultPressed = false,
  onPressedChange,
  count = 0,
  format = group,
  label = "Like",
  burst = 8,
  beat = 72,
  color = "rose",
  resting = true,
  holdToSuper = true,
  superHold = 1200,
  onHoldChange,
  showCount = true,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: BeatLikeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `beat-like-${uid}`;
  const countId = `beat-like-count-${uid}`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const tone = TONES[color as BeatLikeTone] ?? color;
  const bpm = clamp(beat, 40, 180);
  const tempo = bpm / 72;
  const n = Math.round(clamp(burst, 0, MAX_BURST));
  const chargeMs = Math.max(200, superHold);

  const [own, setOwn] = React.useState(defaultPressed);
  const isPressed = pressed ?? own;
  const [said, setSaid] = React.useState("");

  // Geometry, in px from the heart's centre.
  const reach = r2(g.heart * REACH);
  const superReach = r2(g.heart * SUPER_REACH);
  const from = r2(g.heart * 0.55);
  // The burst is drawn as the SVG's overflow around a heart-sized box: like
  // a shadow, it paints past the pill without adding to anyone's layout or
  // scroll width. It reaches about `SUPER_REACH` hearts from the centre.

  const pump = useMotionValue(1);
  const fill = useMotionValue(isPressed ? 1 : 0);
  const ringA = useMotionValue(0);
  const ringB = useMotionValue(0);
  const pulse = useMotionValue(0);
  const pulseK = useMotionValue(1);
  const charge = useMotionValue(0);
  const mark = useMotionValue(0);

  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const hold = React.useRef<Hold | null>(null);
  const busy = React.useRef(false);
  const shown = React.useRef(isPressed);
  const pending = React.useRef<BeatLikeKind | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);
  const lastKey = React.useRef(-1e9);
  const onHoldRef = React.useRef(onHoldChange);
  React.useEffect(() => {
    onHoldRef.current = onHoldChange;
  });

  const ringsA = React.useMemo(() => sparks(n, 0), [n]);
  const ringsB = React.useMemo(() => sparks(n, 1), [n]);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(
      () => {
        timers.current.delete(id);
        fn();
      },
      Math.max(0, Math.round(ms)),
    );
    timers.current.add(id);
  };
  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current.clear();
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + g.padX + g.heart / 2, null) : 0;
  };

  /**
   * One beat: systole on a near-critical spring down to `1 - depth` of
   * `base`, then diastole on an underdamped one to `to`, launched with an
   * outward kick so the relaxation carries past rest. `onOpen` fires as the
   * heart starts to open: that is where the hearts leave.
   */
  const heartbeat = (
    base: number,
    depth: number,
    to: number,
    ratio: number,
    kick: number,
    onOpen?: () => void,
  ) => {
    busy.current = true;
    run(
      "pump",
      animate(pump, r2(base * (1 - depth)), {
        ...spring(1000 * tempo * tempo, 0.92),
        onComplete: () => {
          run(
            "pump",
            animate(pump, to, {
              ...spring(380 * tempo * tempo, ratio),
              velocity: kick * tempo,
              onComplete: () => {
                busy.current = hold.current?.phase === "charging";
              },
            }),
          );
          onOpen?.();
        },
      }),
    );
  };

  const throwRing = (value: MotionValue<number>, long: boolean) => {
    value.jump(0);
    run(
      value === ringA ? "ringA" : "ringB",
      animate(value, 1, {
        duration: motionSafe ? (long ? 0.86 : 0.66) : durations.slow * 2,
        ease: motionSafe ? easings.enter : easings.linear,
      }),
    );
  };

  const throwPulse = (strength = 1) => {
    pulseK.set(strength);
    pulse.jump(0);
    run(
      "pulse",
      animate(pulse, 1, {
        duration: motionSafe ? 0.5 : durations.slow,
        ease: easings.enter,
      }),
    );
  };

  /**
   * The visuals for a change of state. `voiced` is whether the visitor made
   * it: a host's own change beats the heart silently.
   */
  const show = (next: boolean, kind: BeatLikeKind, voiced = true) => {
    const p = pan();
    const say: typeof audio.play = (tone, options) => {
      if (voiced) audio.play(tone, options);
    };
    if (next) {
      const big = kind === "super";
      if (!motionSafe) {
        run(
          "fill",
          animate(fill, 1, { duration: durations.fast, ease: easings.enter }),
        );
        run("pump", animate(pump, 1, { duration: durations.fast }));
        throwRing(ringA, false);
        if (big) throwRing(ringB, true);
        say("pop", { pitch: big ? 0.8 : 1, gain: 0.5, pan: p });
      } else {
        // The colour arrives with the contraction: the beat pumps it in.
        run(
          "fill",
          animate(fill, 1, {
            duration: durations.base / tempo,
            ease: easings.enter,
          }),
        );
        // A charged heart beats from its charged size and relaxes to rest.
        const base = Math.max(1, pump.get());
        heartbeat(
          base,
          big ? 0.3 : 0.2,
          1,
          big ? 0.34 : 0.4,
          big ? 9 : 6,
          () => {
            throwRing(ringA, false);
            throwPulse(1);
            say("pop", { pitch: big ? 0.8 : 1, gain: 0.55, pan: p });
            if (big) {
              later(() => {
                throwRing(ringB, true);
                say("pop", { pitch: 1.3, gain: 0.45, pan: p });
              }, 70);
            }
          },
        );
      }
      run(
        "mark",
        animate(mark, big ? 1 : 0, {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
    } else {
      run(
        "fill",
        animate(fill, 0, { duration: durations.base, ease: easings.exit }),
      );
      run(
        "mark",
        animate(mark, 0, { duration: durations.fast, ease: easings.exit }),
      );
      if (motionSafe) {
        // A sag and a slow recovery: nothing bursts when a like is taken back.
        busy.current = true;
        run(
          "pump",
          animate(pump, 0.9, {
            ...springs.flick,
            onComplete: () =>
              run(
                "pump",
                animate(pump, 1, {
                  ...springs.glide,
                  onComplete: () => {
                    busy.current = false;
                  },
                }),
              ),
          }),
        );
      }
      say("pop", { pitch: 0.55, gain: 0.25, pan: p });
    }
  };

  const commit = (next: boolean, kind: BeatLikeKind) => {
    setSaid(kind === "super" ? "Super liked" : next ? "Liked" : "Like removed");
    if (pressed === undefined) {
      setOwn(next);
      shown.current = next;
      show(next, kind);
    } else if (next === isPressed) {
      // Already where the host says: a super-like over a like still beats.
      show(next, kind);
    } else {
      // Controlled: the heart relaxes and waits. If the host takes the
      // change, the effect below beats it once the host answers; if it
      // refuses, nothing false was shown.
      pending.current = kind;
      // A host that refuses never re-renders: the request lapses after its
      // turn, so a later outside change is not taken for this one.
      window.requestAnimationFrame(() => {
        pending.current = null;
      });
      relax();
    }
    onPressedChange?.(next, kind);
  };

  const relax = () => {
    if (!motionSafe) {
      busy.current = false;
      return;
    }
    run(
      "pump",
      animate(pump, 1, {
        ...springs.glide,
        onComplete: () => {
          busy.current = false;
        },
      }),
    );
  };

  /** Let a racing heart settle without changing anything. */
  const calm = () => {
    run(
      "charge",
      animate(charge, 0, { duration: durations.base, ease: easings.exit }),
    );
    relax();
  };

  const setHold = (state: BeatLikeHold) => onHoldRef.current?.(state);

  const chargeBeat = () => {
    const h = hold.current;
    if (!h || h.phase !== "charging" || h.cancelled) return;
    const c = clamp01((now() - h.start) / chargeMs);
    // A first touch-down is not yet an activation: the held beats stay
    // silent until the page has had one.
    const voiced = activated();
    if (c >= 1 && !h.full) {
      h.full = true;
      setHold("full");
      if (voiced) audio.play("pop", { pitch: 1.2, gain: 0.4, pan: pan() });
    } else if (voiced) {
      audio.play("pop", { pitch: r2(0.42 + c * 0.3), gain: 0.22, pan: pan() });
    }
    if (motionSafe) {
      const base = r2(1 + 0.16 * c);
      heartbeat(base, 0.1 + 0.06 * c, base, 0.45, 3 + 3 * c);
      throwPulse(r2(0.55 + 0.45 * c));
    }
    // Quicker with every beat: the rate climbs to 2.6× as the charge fills.
    const rate = bpm * (1 + 1.6 * Math.pow(c, 1.3));
    later(chargeBeat, 60000 / rate);
  };

  const startCharge = () => {
    const h = hold.current;
    if (!h || h.cancelled) return;
    h.phase = "charging";
    h.start = now();
    busy.current = true;
    setHold("charging");
    charge.jump(0);
    run(
      "charge",
      animate(charge, 1, { duration: chargeMs / 1000, ease: "linear" }),
    );
    chargeBeat();
  };

  const press = (source: "pointer" | "key", pointerId = -1) => {
    if (disabled || hold.current) return;
    hold.current = {
      source,
      pointerId,
      phase: "pressing",
      start: 0,
      full: false,
      cancelled: false,
    };
    if (motionSafe) {
      busy.current = true;
      run("pump", animate(pump, 0.92, springs.flick));
    }
    if (holdToSuper) later(startCharge, HOLD_DELAY);
  };

  const finish = () => {
    clearTimers();
    detach.current?.();
    detach.current = null;
    hold.current = null;
  };

  const release = (source: "pointer" | "key") => {
    const h = hold.current;
    if (!h || h.source !== source) return;
    const phase = h.phase;
    const full = h.full;
    const cancelled = h.cancelled;
    finish();
    if (cancelled) return;
    if (phase === "pressing") {
      commit(!isPressed, isPressed ? "unlike" : "like");
      return;
    }
    setHold("idle");
    run(
      "charge",
      animate(charge, 0, { duration: durations.fast, ease: easings.exit }),
    );
    if (full) commit(true, "super");
    else if (!isPressed) commit(true, "like");
    else calm();
  };

  const cancel = () => {
    const h = hold.current;
    if (!h) return;
    const wasCharging = h.phase === "charging";
    finish();
    if (wasCharging) setHold("idle");
    calm();
  };

  // A host that changes `pressed` gets the same heart a press would.
  React.useEffect(() => {
    if (shown.current === isPressed) return;
    shown.current = isPressed;
    const asked = pending.current;
    pending.current = null;
    api.current?.show(
      isPressed,
      asked ?? (isPressed ? "like" : "unlike"),
      asked !== null,
    );
  }, [isPressed]);

  React.useEffect(() => {
    api.current = {
      show,
      cancel,
      restBeat: () => {
        if (busy.current || hold.current) return;
        // Lub, then dub: two swells, the second smaller, as a heart at rest.
        const swell = (peak: number, done?: () => void) =>
          run(
            "pump",
            animate(pump, peak, {
              ...spring(900 * tempo * tempo, 0.9),
              onComplete: () =>
                run(
                  "pump",
                  animate(pump, 1, {
                    ...spring(500 * tempo * tempo, 0.75),
                    onComplete: done,
                  }),
                ),
            }),
          );
        swell(1.045, () => later(() => swell(1.025), 40 / tempo));
      },
    };
  });

  // The resting heartbeat: only while liked, on screen and in a visible page.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || !isPressed || !resting || !motionSafe) return;
    let timer = 0;
    let visible = true;
    const period = Math.round(60000 / bpm);
    const tick = () => {
      timer = 0;
      if (!visible || document.hidden) return;
      api.current?.restBeat();
      schedule();
    };
    const schedule = () => {
      if (timer || !visible || document.hidden) return;
      timer = window.setTimeout(tick, period);
    };
    const stop = () => {
      window.clearTimeout(timer);
      timer = 0;
    };
    const watcher = new IntersectionObserver((entries) => {
      visible = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (visible) schedule();
      else stop();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) stop();
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [isPressed, resting, motionSafe, bpm]);

  // A hold broken by the page, not the hand, calms the heart.
  React.useEffect(() => {
    const onHidden = () => {
      if (document.hidden && hold.current) api.current?.cancel();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    const pendingTimers = timers.current;
    return () => {
      detach.current?.();
      detach.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
      for (const id of pendingTimers) window.clearTimeout(id);
      pendingTimers.clear();
      hold.current = null;
      busy.current = false;
    };
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (hold.current) return;
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      // A touch keeps its pointer on the button wherever it goes, so a
      // release well off the button is a change of mind, as with a mouse.
      const rect = buttonRef.current?.getBoundingClientRect();
      const off =
        rect &&
        (e.clientX < rect.left - 8 ||
          e.clientX > rect.right + 8 ||
          e.clientY < rect.top - 8 ||
          e.clientY > rect.bottom + 8);
      if (off) cancel();
      else release("pointer");
    };
    const lost = (e: PointerEvent) => {
      if (e.pointerId === id) cancel();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", lost);
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", lost);
    };
    press("pointer", id);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    const h = hold.current;
    if (!h || h.source !== "pointer" || h.pointerId !== event.pointerId) return;
    // Sliding off is how a hand says "never mind".
    cancel();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      // The press is ours: the native click would toggle without the hold.
      event.preventDefault();
      if (!event.repeat) press("key");
      return;
    }
    if (event.key === "Escape" && hold.current) {
      event.preventDefault();
      cancel();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      lastKey.current = now();
      release("key");
    }
  };

  const total = Math.max(0, count) + (isPressed ? 1 : 0);
  const written = format(total);

  // The ring that fills while charging, and stays faintly after a super-like.
  const ringLength = useTransform(
    [charge, mark] as MotionValue<number>[],
    ([c = 0, m = 0]: number[]) => r2(Math.max(c, m)),
  );
  const ringOpacity = useTransform(
    [charge, mark] as MotionValue<number>[],
    ([c = 0, m = 0]: number[]) => r2(c > 0.001 ? 0.9 : m * 0.4),
  );
  const halo = useTransform(charge, (c) => r2(c * 0.22));
  const haloScale = useTransform(charge, (c) =>
    motionSafe ? r2(0.7 + c * 0.5) : 1,
  );
  const fillTop = useTransform(fill, (l) => r2(9.6 - l * 19.4));
  const pulseR = useTransform(pulse, (p) =>
    r2(from + (reach * 1.05 - from) * Math.min(1, p)),
  );
  const pulseOpacity = useTransform(
    [pulse, pulseK] as MotionValue<number>[],
    ([p = 0, k = 1]: number[]) =>
      p <= 0 || p >= 1 ? 0 : r2(0.5 * k * (1 - p)),
  );
  const ringR = r2(g.heart * 0.5 + 3.5);

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      style={{ "--beat-like-color": tone } as React.CSSProperties}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={isPressed}
        aria-label={label}
        aria-describedby={showCount ? countId : undefined}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerLeave={onPointerLeave}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => cancel()}
        onClick={(event) => {
          // A click with no pointer and no key behind it — assistive
          // technology — is a plain toggle.
          if (
            event.detail === 0 &&
            !hold.current &&
            !disabled &&
            now() - lastKey.current > 300
          ) {
            commit(!isPressed, isPressed ? "unlike" : "like");
          }
        }}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer touch-manipulation items-center rounded-full border transition-colors outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          g.gap,
          g.text,
          isPressed
            ? "border-[color-mix(in_oklab,var(--beat-like-color)_42%,transparent)] bg-[color-mix(in_oklab,var(--beat-like-color)_10%,var(--card))] text-foreground"
            : "border-hairline-strong bg-card text-ink-2 hover:bg-surface-2 hover:text-foreground",
        )}
        style={{
          height: g.pill,
          paddingLeft: showCount ? g.padX : 0,
          paddingRight: showCount ? g.padX + 4 : 0,
          width: showCount ? undefined : g.pill,
          justifyContent: showCount ? undefined : "center",
        }}
      >
        <span
          className="relative grid shrink-0 place-items-center"
          style={{ width: g.heart, height: g.heart }}
        >
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={g.heart}
            height={g.heart}
            viewBox={`${-g.heart / 2} ${-g.heart / 2} ${g.heart} ${g.heart}`}
          >
            <motion.circle
              r={g.heart * 0.62}
              className="fill-[var(--beat-like-color)]"
              style={{
                opacity: halo,
                scale: haloScale,
                originX: 0.5,
                originY: 0.5,
              }}
            />
            <motion.circle
              r={pulseR}
              fill="none"
              strokeWidth={1}
              className="stroke-[var(--beat-like-color)]"
              style={{ opacity: pulseOpacity }}
            />
            <motion.circle
              r={ringR}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              transform="rotate(-90)"
              className="stroke-[var(--beat-like-color)]"
              style={{ pathLength: ringLength, opacity: ringOpacity }}
            />
            {ringsA.map((spark, i) => (
              <Particle
                key={`a${i}`}
                t={ringA}
                spark={spark}
                from={from}
                reach={reach}
                still={!motionSafe}
              />
            ))}
            {ringsB.map((spark, i) => (
              <Particle
                key={`b${i}`}
                t={ringB}
                spark={spark}
                from={from}
                reach={superReach}
                still={!motionSafe}
              />
            ))}
          </svg>
          <motion.svg
            aria-hidden
            width={g.heart}
            height={g.heart}
            viewBox="-12 -12 24 24"
            className="relative block overflow-visible"
            style={{ scale: pump }}
          >
            <defs>
              <clipPath id={clipId}>
                <motion.rect x={-12} width={24} height={26} y={fillTop} />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              <path d={HEART} className="fill-[var(--beat-like-color)]" />
              <ellipse
                cx={-5}
                cy={-4.6}
                rx={2.3}
                ry={1.3}
                transform="rotate(-38 -5 -4.6)"
                className="fill-white/35"
              />
            </g>
            <path
              d={HEART}
              fill="none"
              strokeWidth={1.7}
              strokeLinejoin="round"
              className={cn(
                "transition-[stroke] duration-150",
                isPressed
                  ? "stroke-[var(--beat-like-color)]"
                  : "stroke-current",
              )}
            />
          </motion.svg>
        </span>
        {showCount ? (
          <>
            <Roll text={written} motionSafe={motionSafe} />
            <span id={countId} className="sr-only">
              {`${written} ${total === 1 ? "like" : "likes"}`}
            </span>
          </>
        ) : null}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
