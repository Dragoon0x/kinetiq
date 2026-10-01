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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EmbossCardStock = "cotton" | "kraft" | "black";

export type EmbossCardDetail = {
  /** A short label printed beside the value, e.g. "Email". */
  label: string;
  /** The detail itself, printed on the back of the card. */
  value: string;
  /** Makes the value a link: `mailto:`, `tel:`, `https:`. */
  href?: string;
};

export type EmbossCardProps = {
  /** The name, blind-debossed on the front. */
  name: string;
  /** The job title, printed under the name. */
  title?: string;
  /** The company, printed in spaced capitals at the top right. */
  company?: string;
  /** Contact lines printed on the back; up to four fit the card. */
  details?: EmbossCardDetail[];
  /** One or two letters debossed into the roundel. @default the name's initials */
  monogram?: string;
  /** Controlled: whether the back (the contact details) faces up. */
  flipped?: boolean;
  /** Initial side when uncontrolled. @default false */
  defaultFlipped?: boolean;
  /** Fires from the tap, drag or button that turned the card, with the new side. */
  onFlippedChange?: (flipped: boolean) => void;
  /** What Copy puts on the clipboard. @default the name, title, company and every detail, one per line */
  copyText?: string;
  /** Fires once the contact is on the clipboard, with the text that was copied. */
  onCopy?: (text: string) => void;
  /** How deep the press is, 0 to 1: the bevel's angle, the walls' width, the rim's shadow. @default 0.6 */
  depth?: number;
  /** The board the card is pressed into. @default "cotton" */
  stock?: EmbossCardStock;
  /** A lamp that follows the pointer. Off: a fixed light from the upper left. @default true */
  light?: boolean;
  /** Play the copy click and the card landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type StockDef = {
  paper: string;
  /** The floor of a debossed cavity: far enough under the paper that the name reads at rest, before any light rakes it. */
  floor: string;
  /** Highlight and shadow as oklch "L C H" triples, given an alpha per stop. */
  hi: string;
  lo: string;
  hiGain: number;
  loGain: number;
  ink: string;
  faint: string;
  fibres: readonly [string, string];
  strands: number;
  flecks: number;
  sheen: number;
  edge: string;
};

// Board is pigment, not text colour: it looks the same in either theme, so
// it is fixed art rather than tokens.
const STOCKS: Record<EmbossCardStock, StockDef> = {
  cotton: {
    paper: "oklch(0.962 0.011 88)",
    floor: "oklch(0.86 0.02 85)",
    hi: "1 0.004 90",
    lo: "0.4 0.03 70",
    hiGain: 2.6,
    loGain: 1.9,
    ink: "oklch(0.32 0.02 255)",
    faint: "oklch(0.52 0.018 255)",
    fibres: ["oklch(0.86 0.016 82)", "oklch(0.995 0.004 90)"],
    strands: 70,
    flecks: 0,
    sheen: 0.42,
    edge: "oklch(0.3 0.02 70 / 0.14)",
  },
  kraft: {
    paper: "oklch(0.7 0.062 68)",
    floor: "oklch(0.57 0.066 66)",
    hi: "0.88 0.05 80",
    lo: "0.3 0.05 55",
    hiGain: 2.2,
    loGain: 1.6,
    ink: "oklch(0.27 0.035 50)",
    faint: "oklch(0.4 0.045 55)",
    fibres: ["oklch(0.52 0.06 55)", "oklch(0.82 0.05 78)"],
    strands: 30,
    flecks: 150,
    sheen: 0.3,
    edge: "oklch(0.25 0.04 55 / 0.28)",
  },
  black: {
    paper: "oklch(0.215 0.007 260)",
    floor: "oklch(0.135 0.006 260)",
    hi: "0.66 0.012 255",
    lo: "0.04 0.004 260",
    hiGain: 1.7,
    loGain: 2.4,
    ink: "oklch(0.93 0.008 90)",
    faint: "oklch(0.7 0.01 90)",
    fibres: ["oklch(0.28 0.008 260)", "oklch(0.165 0.008 260)"],
    strands: 40,
    flecks: 40,
    sheen: 0.26,
    edge: "oklch(1 0 0 / 0.1)",
  },
};

/** The card is 7 by 4 units; the lamp hangs this high above it. */
const HALF_W = 3.5;
const HALF_H = 2;
const LAMP_Z = 3.2;
/** Where the lamp rests: up and to the left, like a window. */
const REST = { x: -0.75, y: -1.15 } as const;
/** Centres of the lit parts, in card units from the middle (they follow the layout's percentages). */
const ROUNDEL_AT = { x: -2.45, y: -0.95 } as const;
const NAME_AT = { x: -1.7, y: 0.95 } as const;
const CORNER_AT = { x: 2.85, y: -1.3 } as const;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

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

type Lit = {
  /** Azimuth of the lamp seen from the part, screen radians. */
  az: number;
  /** How much of the light comes from the side, 0 to 1. */
  s: number;
  /** How much comes from above. */
  lz: number;
};

const litFrom = (lx: number, ly: number, at: { x: number; y: number }): Lit => {
  const vx = lx * HALF_W - at.x;
  const vy = ly * HALF_H - at.y;
  const len = Math.hypot(vx, vy, LAMP_Z);
  return {
    az: Math.atan2(vy, vx),
    s: Math.hypot(vx, vy) / len,
    lz: LAMP_Z / len,
  };
};

const tone = (delta: number, st: StockDef) =>
  delta >= 0
    ? `oklch(${st.hi} / ${r3(Math.min(0.9, delta * st.hiGain))})`
    : `oklch(${st.lo} / ${r3(Math.min(0.85, -delta * st.loGain))})`;

/**
 * A circular bevel lit by the lamp. A facet at angle m whose slope tilts its
 * normal outward by `tilt` is brighter than the flat paper by
 * sin(tilt)·s·cos(m − az) + (cos(tilt) − 1)·lz: a cosine around the ring,
 * peaking toward the lamp. Sampled at 12 stops into a conic gradient (whose
 * zero is twelve o'clock, hence the quarter turn). `sign` −1 is a wall that
 * faces inward, lit on the far side.
 */
function bevel(l: Lit, tilt: number, sign: 1 | -1, st: StockDef): string {
  const stops: string[] = [];
  for (let k = 0; k <= 12; k += 1) {
    const css = k * 30;
    const m = ((css - 90) * Math.PI) / 180;
    const delta =
      sign * Math.sin(tilt) * l.s * Math.cos(m - l.az) +
      (Math.cos(tilt) - 1) * l.lz;
    stops.push(`${tone(delta, st)} ${css}deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

/** A ring of a circle, as a mask: transparent outside [a, b] of the radius. */
const band = (a: number, b: number) =>
  a <= 0
    ? `radial-gradient(circle closest-side, black ${b - 1}%, transparent ${b}%)`
    : `radial-gradient(circle closest-side, transparent ${a}%, black ${a + 1}%, black ${b - 1}%, transparent ${b}%)`;

const BANDS = {
  rim: band(86, 100),
  grooveOut: band(62, 71),
  grooveIn: band(48, 57),
} as const;

/** A rough advance for each character, in ems: enough to size the deboss's box. */
function advance(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (ch === " ") w += 0.28;
    else if ("iljtfr.,'".includes(ch)) w += 0.32;
    else if ("mw".includes(ch)) w += 0.82;
    else if ("MW".includes(ch)) w += 0.92;
    else if (ch >= "A" && ch <= "Z") w += 0.68;
    else w += 0.55;
  }
  return w;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .filter((c) => /\p{L}/u.test(c))
    .slice(0, 2)
    .join("")
    .toUpperCase();

type Fibre = { d: string; stroke: string; opacity: number };
type Fleck = {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  opacity: number;
};

/** The board's tooth: seeded fibres and flecks, drawn once per stock. */
function toothOf(st: StockDef, seed: number) {
  const rand = lcg(seed);
  const strands: Fibre[] = [];
  for (let i = 0; i < st.strands; i += 1) {
    const x = rand() * 350;
    const y = rand() * 200;
    const a = rand() * Math.PI;
    const len = 5 + rand() * 12;
    const bend = (rand() - 0.5) * 6;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const mx = (x + ex) / 2 - Math.sin(a) * bend;
    const my = (y + ey) / 2 + Math.cos(a) * bend;
    strands.push({
      d: `M${r2(x)} ${r2(y)}Q${r2(mx)} ${r2(my)} ${r2(ex)} ${r2(ey)}`,
      stroke: st.fibres[i % 2] ?? st.fibres[0],
      opacity: r2(0.3 + rand() * 0.4),
    });
  }
  const flecks: Fleck[] = [];
  for (let i = 0; i < st.flecks; i += 1) {
    flecks.push({
      cx: r2(rand() * 350),
      cy: r2(rand() * 200),
      r: r2(0.3 + rand() * 0.8),
      fill: st.fibres[i % 3 === 0 ? 1 : 0] ?? st.fibres[0],
      opacity: r2(0.35 + rand() * 0.45),
    });
  }
  return { strands, flecks };
}

/** A stereo position for a sound made by the whole card. */
const centrePan = (el: Element | null) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};

type Shift = { x: number; y: number };

/**
 * Text pressed into the board. Inside the letters' own shape: the cavity's
 * floor is the text shifted away from the lamp, which leaves the wall nearest
 * the lamp uncovered, in shadow; the far wall — the text minus the text
 * shifted toward the lamp — catches the light. `toward` is that shift.
 */
function Deboss({
  id,
  text,
  width,
  height,
  x,
  y,
  size,
  anchor,
  length,
  weight,
  tracking,
  toward,
  st,
  wall,
  preserve,
  className,
}: {
  id: string;
  text: string;
  width: number;
  height: number;
  x: number;
  y: number;
  size: number;
  anchor: "start" | "middle";
  length?: number;
  weight: number;
  tracking: string;
  toward: MotionValue<Shift>;
  st: StockDef;
  wall: number;
  preserve: string;
  className?: string;
}) {
  const nearX = useTransform(toward, (t) => r2(-t.x));
  const nearY = useTransform(toward, (t) => r2(-t.y));
  const farX = useTransform(toward, (t) => r2(t.x));
  const farY = useTransform(toward, (t) => r2(t.y));
  const glyphs = {
    x,
    y,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: tracking,
    textAnchor: anchor,
    textLength: length,
    lengthAdjust: length ? ("spacing" as const) : undefined,
    className: "font-sans",
  };
  const pad = 12;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={preserve}
      className={cn("block overflow-visible", className)}
    >
      <defs>
        <clipPath id={`${id}-c`}>
          <text {...glyphs}>{text}</text>
        </clipPath>
        <mask
          id={`${id}-m`}
          maskUnits="userSpaceOnUse"
          x={-pad}
          y={-pad}
          width={width + 2 * pad}
          height={height + 2 * pad}
        >
          <rect
            x={-pad}
            y={-pad}
            width={width + 2 * pad}
            height={height + 2 * pad}
            fill="white"
          />
          <motion.text {...glyphs} fill="black" style={{ x: farX, y: farY }}>
            {text}
          </motion.text>
        </mask>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <rect
          x={-pad}
          y={-pad}
          width={width + 2 * pad}
          height={height + 2 * pad}
          style={{
            fill: `color-mix(in oklab, ${st.floor} ${Math.round(100 - wall * 100)}%, oklch(${st.lo}))`,
          }}
        />
        <motion.text {...glyphs} style={{ fill: st.floor, x: nearX, y: nearY }}>
          {text}
        </motion.text>
        <rect
          x={-pad}
          y={-pad}
          width={width + 2 * pad}
          height={height + 2 * pad}
          mask={`url(#${id}-m)`}
          style={{ fill: `oklch(${st.hi} / ${r2(0.5 + wall * 0.5)})` }}
        />
      </g>
    </svg>
  );
}

/**
 * The blind-embossed mark: a raised rim, a groove, a raised centre with the
 * monogram pressed into it. Every band is the same board, so the roundel is
 * seen only through its light — overhead, it all but disappears.
 */
function Roundel({
  id,
  lit,
  toward,
  tilt,
  depth,
  st,
  monogram,
}: {
  id: string;
  lit: MotionValue<Lit>;
  toward: MotionValue<Shift>;
  tilt: number;
  depth: number;
  st: StockDef;
  monogram: string;
}) {
  const rim = useTransform(lit, (l) => bevel(l, tilt, 1, st));
  const grooveOut = useTransform(lit, (l) => bevel(l, tilt * 0.9, -1, st));
  const grooveIn = useTransform(lit, (l) => bevel(l, tilt * 0.9, 1, st));
  // The raised rim throws a short shadow on the board away from the lamp,
  // longer the lower the lamp.
  const cast = useTransform(lit, (l) => {
    const k = (0.6 + 1.8 * depth) * (l.s / Math.max(0.25, l.lz));
    const dx = r2(-Math.cos(l.az) * k);
    const dy = r2(-Math.sin(l.az) * k);
    return `${dx}px ${dy}px ${r1(1 + depth * 2)}px oklch(${st.lo} / ${r2(0.16 + depth * 0.22)})`;
  });
  const size = monogram.length > 1 ? 40 : 50;
  return (
    <div className="relative aspect-square w-[19%] shrink-0">
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: cast }}
      />
      {(
        [
          [rim, BANDS.rim],
          [grooveOut, BANDS.grooveOut],
          [grooveIn, BANDS.grooveIn],
        ] as const
      ).map(([image, mask], i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            backgroundImage: image,
            maskImage: mask,
            WebkitMaskImage: mask,
          }}
        />
      ))}
      <div className="absolute inset-[24%]">
        <Deboss
          id={id}
          text={monogram}
          width={100}
          height={100}
          x={50}
          y={50 + size * 0.36}
          size={size}
          anchor="middle"
          weight={600}
          tracking="0.02em"
          toward={toward}
          st={st}
          wall={0.5 + depth * 0.3}
          preserve="xMidYMid meet"
          className="size-full"
        />
      </div>
    </div>
  );
}

function TurnGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.5a5.5 5.5 0 0 1 9.6-2.4" />
      <path d="M12.6 1.8v2.6H10" />
      <path d="M13.5 9.5a5.5 5.5 0 0 1-9.6 2.4" />
      <path d="M3.4 14.2v-2.6H6" />
    </svg>
  );
}

/**
 * A business card lying on the table: the name blind-debossed into the board,
 * the mark a blind-embossed roundel, and one small lamp that follows the
 * pointer, so the impression turns as the light moves — the walls facing the
 * lamp go bright, the ones facing away fall into shadow. The lighting is
 * analytic (a cosine around each bevel, the letters masked against
 * themselves shifted along the light), never a blur filter.
 *
 * Tap the card, drag it sideways, or press Details, and it turns over: a drag
 * turns it 1:1 under the finger and a release commits to the face the throw
 * was heading for, on the snap spring with the release velocity, lifting off
 * the table as it goes. The back carries the contact details. Copy puts the
 * contact on the clipboard and draws a check. Under reduced motion the faces
 * cross-fade and the lamp moves without a spring.
 */
export function EmbossCard({
  name,
  title,
  company,
  details = [],
  monogram,
  flipped,
  defaultFlipped = false,
  onFlippedChange,
  copyText,
  onCopy,
  depth = 0.6,
  stock = "cotton",
  light = true,
  sound = false,
  disabled = false,
  className,
}: EmbossCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const st = STOCKS[stock] ?? STOCKS.cotton;
  const d = clamp(depth, 0, 1);
  const tilt = ((8 + 42 * d) * Math.PI) / 180;
  const wallPx = 0.35 + 1.25 * d;
  const mark = (monogram ?? initialsOf(name)).slice(0, 2) || "·";
  const lines = details.slice(0, 4);
  const lamp = light && !disabled;

  const [own, setOwn] = React.useState(defaultFlipped);
  const isFlipped = flipped ?? own;
  const [copied, setCopied] = React.useState<"idle" | "done" | "failed">(
    "idle",
  );
  const [said, setSaid] = React.useState({ n: 0, key: isFlipped, text: "" });
  if (said.key !== isFlipped) {
    setSaid({
      n: said.n + 1,
      key: isFlipped,
      text: isFlipped
        ? "Showing the contact details."
        : "Showing the front of the card.",
    });
  }

  const lx = useMotionValue<number>(REST.x);
  const ly = useMotionValue<number>(REST.y);
  const turn = useMotionValue(isFlipped ? 180 : 0);
  const frontOpacity = useMotionValue(1);
  const backOpacity = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const shown = React.useRef(isFlipped);
  const turning = React.useRef<AnimationPlaybackControls | null>(null);
  const fades = React.useRef<AnimationPlaybackControls[]>([]);
  const landing = React.useRef<(() => void) | null>(null);
  const sweeping = React.useRef<AnimationPlaybackControls[]>([]);
  const lampMoves = React.useRef<AnimationPlaybackControls[]>([]);
  const dragStart = React.useRef(0);
  const dragging = React.useRef(false);
  const copyTimer = React.useRef(0);
  const alive = React.useRef(true);
  const voicedAt = React.useRef(-Infinity);

  const tooth = React.useMemo(() => toothOf(st, hash(stock)), [st, stock]);

  const stopTurn = React.useCallback(() => {
    turning.current?.stop();
    turning.current = null;
    for (const f of fades.current) f.stop();
    fades.current = [];
    landing.current?.();
    landing.current = null;
  }, []);

  /**
   * Carries the card to a side. A turn always runs forward from where the
   * card is (or to the target a drag chose), and at rest the angle is folded
   * back into 0 or 180 so it never winds up.
   */
  const settle = React.useCallback(
    (
      toBack: boolean,
      opts: { target?: number; velocity?: number; voiced?: boolean } = {},
    ) => {
      stopTurn();
      if (!motionSafe) {
        turn.jump(0);
        const tween = { duration: durations.base, ease: easings.enter };
        fades.current = [
          animate(frontOpacity, toBack ? 0 : 1, tween),
          animate(backOpacity, toBack ? 1 : 0, tween),
        ];
        return;
      }
      frontOpacity.jump(1);
      backOpacity.jump(1);
      const now = turn.get();
      let target = opts.target;
      if (target === undefined) {
        const k = Math.round(now / 180);
        const parity = ((k % 2) + 2) % 2;
        target = (parity === (toBack ? 1 : 0) ? k : k + 1) * 180;
      }
      const goal = target;
      if (opts.voiced) {
        // The card lands where it settles near its face, not when the spring
        // finally rests: that is when it touches the table.
        let heard = false;
        const off = turn.on("change", (v) => {
          if (heard || Math.abs(v - goal) > 3) return;
          heard = true;
          audio.play("click", {
            pitch: 0.62,
            gain: 0.35,
            pan: centrePan(stageRef.current),
          });
        });
        landing.current = off;
      }
      turning.current = animate(turn, goal, {
        ...springs.snap,
        velocity: opts.velocity ?? 0,
        onComplete: () => {
          turning.current = null;
          landing.current?.();
          landing.current = null;
          turn.jump((((goal % 360) + 360) % 360) as number);
        },
      });
    },
    [audio, backOpacity, frontOpacity, motionSafe, stopTurn, turn],
  );

  // The host's side, or a change of motion preference, gets the same turn.
  React.useEffect(() => {
    if (shown.current === isFlipped) return;
    shown.current = isFlipped;
    // A host answering the visitor's own turn lands with the same click.
    const voiced = performance.now() - voicedAt.current < 600;
    if (!dragging.current) settle(isFlipped, { voiced });
  }, [isFlipped, settle]);

  React.useEffect(() => {
    stopTurn();
    if (motionSafe) {
      turn.jump(shown.current ? 180 : 0);
      frontOpacity.jump(1);
      backOpacity.jump(1);
    } else {
      turn.jump(0);
      frontOpacity.jump(shown.current ? 0 : 1);
      backOpacity.jump(shown.current ? 1 : 0);
    }
  }, [motionSafe, stopTurn, turn, frontOpacity, backOpacity]);

  const commit = (
    next: boolean,
    opts: { target?: number; velocity?: number } = {},
  ) => {
    voicedAt.current = performance.now();
    if (next === isFlipped) {
      settle(next, opts);
      return;
    }
    if (flipped === undefined) {
      setOwn(next);
      shown.current = next;
      settle(next, { ...opts, voiced: true });
    } else {
      // Controlled: back to where the host says it is. If the host takes the
      // turn, the effect above carries the card over when it answers.
      settle(isFlipped, { velocity: opts.velocity });
    }
    onFlippedChange?.(next);
  };

  // The lamp: the glide spring while it follows a hand, the drift spring as it
  // goes back to rest. Under reduced motion it goes straight there.
  const aim = (x: number, y: number, how: "follow" | "rest") => {
    for (const s of sweeping.current) s.stop();
    sweeping.current = [];
    const tx = r3(clamp(x, -1.4, 1.4));
    const ty = r3(clamp(y, -1.6, 1.6));
    if (!motionSafe) {
      lx.jump(tx);
      ly.jump(ty);
      return;
    }
    const s = how === "rest" ? springs.drift : springs.glide;
    lampMoves.current = [animate(lx, tx, s), animate(ly, ty, s)];
  };

  const follow = (event: React.PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!lamp || !rect || rect.width < 1) return;
    aim(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      ((event.clientY - rect.top) / rect.height) * 2 - 1,
      "follow",
    );
  };

  /** One slow arc of the lamp across the card, for a keyboard arrival. */
  const sweep = () => {
    if (!lamp || !motionSafe || sweeping.current.length) return;
    const t = { duration: 1.8, ease: easings.move, times: [0, 0.42, 0.78, 1] };
    sweeping.current = [
      animate(lx, [lx.get(), 1.15, 0.15, REST.x], t),
      animate(ly, [ly.get(), -0.35, 1.15, REST.y], {
        ...t,
        onComplete: () => {
          sweeping.current = [];
        },
      }),
    ];
  };

  // A lamp switched off (or a card disabled) goes back to its resting place.
  React.useEffect(() => {
    if (lamp) return;
    for (const s of sweeping.current) s.stop();
    sweeping.current = [];
    lx.jump(REST.x);
    ly.jump(REST.y);
  }, [lamp, lx, ly]);

  React.useEffect(() => {
    alive.current = true;
    const sweeps = sweeping;
    const moves = lampMoves;
    return () => {
      alive.current = false;
      stopTurn();
      for (const s of [...sweeps.current, ...moves.current]) s.stop();
      sweeps.current = [];
      moves.current = [];
      window.clearTimeout(copyTimer.current);
    };
  }, [stopTurn]);

  const degPerPx = () =>
    180 / Math.max(80, (stageRef.current?.clientWidth ?? 300) * 0.9);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled,
    onStart: () => {
      dragging.current = true;
      stopTurn();
      dragStart.current = turn.get();
    },
    onMove: ({ offset }) => {
      if (!motionSafe) return;
      const base = dragStart.current;
      turn.set(
        r2(
          rubberClamp(base + offset.x * degPerPx(), base - 180, base + 180, 70),
        ),
      );
    },
    onEnd: ({ offset, velocity }) => {
      dragging.current = false;
      if (!motionSafe) {
        const w = stageRef.current?.clientWidth ?? 300;
        if (Math.abs(offset.x) > w / 3) commit(!isFlipped);
        else settle(isFlipped);
        return;
      }
      const base = dragStart.current;
      const v = velocity.x * degPerPx();
      const rest = project(turn.get(), v, 0.99);
      const target = clamp(
        Math.round(rest / 180) * 180,
        base - 180,
        base + 180,
      );
      const half = ((Math.round(target / 180) % 2) + 2) % 2;
      commit(half === 1, { target, velocity: v });
    },
    onCancel: () => {
      dragging.current = false;
      settle(isFlipped);
    },
    onTap: (event) => {
      // A link or button on the card does its own thing.
      if (
        event.target instanceof Element &&
        event.target.closest("a, button")
      ) {
        return;
      }
      commit(!isFlipped);
    },
  });

  const contactText = React.useMemo(
    () =>
      copyText ??
      [
        name,
        [title, company].filter(Boolean).join(", "),
        ...details.map((line) => line.value),
      ]
        .filter(Boolean)
        .join("\n"),
    [copyText, name, title, company, details],
  );

  const copy = async () => {
    if (disabled) return;
    audio.play("click", {
      pitch: 1.2,
      gain: 0.6,
      pan: centrePan(stageRef.current),
    });
    let ok = false;
    try {
      await navigator.clipboard.writeText(contactText);
      ok = true;
    } catch {
      // No clipboard permission (or no secure context): the older route.
      try {
        const area = document.createElement("textarea");
        area.value = contactText;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        area.remove();
      } catch {
        ok = false;
      }
    }
    if (!alive.current) return;
    window.clearTimeout(copyTimer.current);
    setCopied(ok ? "done" : "failed");
    setSaid((s) => ({
      ...s,
      n: s.n + 1,
      text: ok
        ? "Contact copied to the clipboard."
        : "Couldn't copy. Select the details on the back to copy them.",
    }));
    if (ok) onCopy?.(contactText);
    copyTimer.current = window.setTimeout(() => setCopied("idle"), 1800);
  };

  // Everything lit, from the lamp.
  const roundelLit = useTransform(
    [lx, ly] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) => litFrom(x, y, ROUNDEL_AT),
  );
  const shiftOf = (l: Lit, scale: number): Shift => {
    const len = Math.min(2.6, (wallPx * l.s) / Math.max(0.2, l.lz)) * scale;
    return { x: r2(Math.cos(l.az) * len), y: r2(Math.sin(l.az) * len) };
  };
  const roundelShift = useTransform(roundelLit, (l) => shiftOf(l, 3));
  const nameShift = useTransform(
    [lx, ly] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) => shiftOf(litFrom(x, y, NAME_AT), 1),
  );
  const cornerShift = useTransform(
    [lx, ly] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) => shiftOf(litFrom(x, y, CORNER_AT), 1),
  );
  const sheen = useTransform(
    [lx, ly] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) =>
      lamp
        ? `radial-gradient(circle at ${r1((x + 1) * 50)}% ${r1((y + 1) * 50)}%, oklch(${st.hi} / ${st.sheen}) 0%, oklch(${st.hi} / 0) 48%)`
        : "none",
  );

  const lift = useTransform(turn, (t) =>
    r3(Math.abs(Math.sin((t * Math.PI) / 180))),
  );
  const lifted = useTransform(lift, (l) => r3(1 + 0.02 * l));
  const shadowWidth = useTransform(turn, (t) =>
    r3(Math.max(0.04, Math.abs(Math.cos((t * Math.PI) / 180)))),
  );
  // The card's shadow falls away from the lamp; lifted, it widens and softens.
  const tableShadow = useTransform(
    [lx, ly, lift] as MotionValue<number>[],
    ([x = 0, y = 0, l = 0]: number[]) => {
      const vx = x * HALF_W;
      const vy = y * HALF_H;
      const len = Math.hypot(vx, vy, LAMP_Z);
      const dx = r1(clamp((-vx / len) * 6, -4, 4));
      const dy = r1(clamp((-vy / len) * 6 + 2, 1, 5) + l * 3);
      const blur = r1(8 + l * 6);
      return `0 1px 1px oklch(0.15 0.01 260 / 0.18), ${dx}px ${dy}px ${blur}px oklch(0.15 0.01 260 / ${r2(0.26 - l * 0.08)})`;
    },
  );

  const faceBase = cn(
    "absolute inset-0 overflow-clip rounded-2",
    motionSafe && "backface-hidden",
  );

  const toothArt = (
    <svg
      aria-hidden
      viewBox="0 0 350 200"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {tooth.flecks.map((f, i) => (
        <circle
          key={`f${i}`}
          cx={f.cx}
          cy={f.cy}
          r={f.r}
          style={{ fill: f.fill }}
          opacity={f.opacity}
        />
      ))}
      {tooth.strands.map((f, i) => (
        <path
          key={`s${i}`}
          d={f.d}
          fill="none"
          strokeWidth={0.45}
          strokeLinecap="round"
          style={{ stroke: f.stroke }}
          opacity={f.opacity}
        />
      ))}
    </svg>
  );

  const nameSize = 21;
  const nameLength = Math.round(advance(name) * nameSize * 1.04 + 4);
  const sheenLayer = (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: sheen }}
    />
  );

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`${name}, business card`}
      onFocus={(event) => {
        // A keyboard arrival from outside gets one sweep of the lamp.
        const from = event.relatedTarget;
        if (from instanceof Node && rootRef.current?.contains(from)) return;
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          sweep();
        }
      }}
      className={cn(
        "flex w-full max-w-83 flex-col gap-2 px-[4%] pt-2.5",
        className,
      )}
    >
      <div
        ref={stageRef}
        onPointerDown={(event) => {
          drag.onPointerDown(event);
          if (event.pointerType !== "mouse") follow(event);
        }}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          follow(event);
        }}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        onPointerLeave={() => {
          if (lamp && !dragging.current) aim(REST.x, REST.y, "rest");
        }}
        className={cn(
          "relative aspect-[7/4] w-full touch-pan-y select-none [-webkit-touch-callout:none] perspective-[2400px]",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-2"
          style={{ scaleX: shadowWidth, boxShadow: tableShadow }}
        />
        <motion.div
          className="absolute inset-0 transform-3d"
          style={{ rotateY: turn, scale: lifted }}
        >
          <motion.div
            aria-hidden={isFlipped || undefined}
            inert={isFlipped}
            className={faceBase}
            style={{
              backgroundColor: st.paper,
              boxShadow: `inset 0 0 0 0.5px ${st.edge}`,
              opacity: frontOpacity,
            }}
          >
            {toothArt}
            <div className="relative flex size-full flex-col justify-between p-[5.5%]">
              <div className="flex items-start justify-between gap-3">
                <Roundel
                  id={`${uid}-mark`}
                  lit={roundelLit}
                  toward={roundelShift}
                  tilt={tilt}
                  depth={d}
                  st={st}
                  monogram={mark}
                />
                {company ? (
                  <p
                    className="min-w-0 truncate pt-0.5 font-mono text-[9px] tracking-[0.22em] uppercase"
                    style={{ color: st.faint }}
                    title={company}
                  >
                    {company}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="sr-only">{name}</p>
                <Deboss
                  id={`${uid}-name`}
                  text={name}
                  width={nameLength}
                  height={28}
                  x={1}
                  y={21}
                  size={nameSize}
                  anchor="start"
                  length={nameLength - 4}
                  weight={600}
                  tracking="0.03em"
                  toward={nameShift}
                  st={st}
                  wall={0.42 + d * 0.3}
                  preserve="xMinYMid meet"
                  className="h-7 w-full"
                />
                {title ? (
                  <p
                    className="mt-0.5 truncate text-[11px] leading-4"
                    style={{ color: st.ink }}
                    title={title}
                  >
                    {title}
                  </p>
                ) : null}
              </div>
            </div>
            {sheenLayer}
          </motion.div>

          <motion.div
            aria-hidden={!isFlipped || undefined}
            inert={!isFlipped}
            className={cn(faceBase, motionSafe && "rotate-y-180")}
            style={{
              backgroundColor: st.paper,
              boxShadow: `inset 0 0 0 0.5px ${st.edge}`,
              opacity: backOpacity,
            }}
          >
            {toothArt}
            <div className="relative flex size-full flex-col justify-center gap-2.5 px-[6%] py-[5%]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="truncate text-xs leading-4 font-semibold"
                    style={{ color: st.ink }}
                  >
                    {name}
                  </p>
                  {title || company ? (
                    <p
                      className="truncate text-[10px] leading-3.5"
                      style={{ color: st.faint }}
                    >
                      {[title, company].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <Deboss
                  id={`${uid}-corner`}
                  text={mark}
                  width={44}
                  height={28}
                  x={22}
                  y={21}
                  size={20}
                  anchor="middle"
                  weight={600}
                  tracking="0.02em"
                  toward={cornerShift}
                  st={st}
                  wall={0.4 + d * 0.3}
                  preserve="xMidYMid meet"
                  className="h-7 w-11 shrink-0"
                />
              </div>
              {lines.length ? (
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
                  {lines.map((line) => (
                    <React.Fragment key={`${line.label}-${line.value}`}>
                      <dt
                        className="font-mono text-[9px] tracking-[0.12em] uppercase"
                        style={{ color: st.faint }}
                      >
                        {line.label}
                      </dt>
                      <dd
                        className="min-w-0 truncate text-[11px] leading-4"
                        title={line.value}
                      >
                        {line.href ? (
                          <a
                            href={line.href}
                            className="rounded-1 underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
                            style={{ color: st.ink }}
                          >
                            {line.value}
                          </a>
                        ) : (
                          <span style={{ color: st.ink }}>{line.value}</span>
                        )}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              ) : null}
            </div>
            {sheenLayer}
          </motion.div>
        </motion.div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-pressed={isFlipped}
          disabled={disabled}
          onClick={() => commit(!isFlipped)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground aria-pressed:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card",
          )}
        >
          <TurnGlyph />
          Details
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void copy()}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card",
            copied === "done" && "text-success",
            copied === "failed" && "text-danger",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.g
              initial={false}
              animate={{ opacity: copied === "done" ? 0 : 1 }}
              transition={{ duration: durations.fast }}
            >
              <rect x={5.5} y={5.5} width={8} height={8} rx={1.5} />
              <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1H3.5a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
            </motion.g>
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              initial={false}
              animate={{
                pathLength: copied === "done" ? 1 : 0,
                opacity: copied === "done" ? 1 : 0,
              }}
              transition={
                motionSafe && copied === "done"
                  ? {
                      pathLength: springs.flick,
                      opacity: { duration: durations.blink },
                    }
                  : { duration: 0 }
              }
            />
          </svg>
          <span className="grid">
            {(["idle", "done", "failed"] as const).map((state) => (
              <span
                key={state}
                aria-hidden={state !== copied || undefined}
                className={cn(
                  "[grid-area:1/1]",
                  state !== copied && "invisible",
                )}
              >
                {state === "idle"
                  ? "Copy"
                  : state === "done"
                    ? "Copied"
                    : "Failed"}
              </span>
            ))}
          </span>
        </button>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
