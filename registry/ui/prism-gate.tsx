"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PrismGateTone = "graphite" | "sepia" | "cyano" | "paper";

export type PrismGateItem = {
  /** A picture. Without one, `art` or a drawn print is used. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** A short title shown under the glass while the picture holds there. Defaults to `alt`. */
  caption?: string;
  /** Your own art (fills the picture's box). */
  art?: React.ReactNode;
};

export type PrismGateProps = {
  /** The pictures on the rail. @default defaultPrismGateItems */
  items?: PrismGateItem[];
  /** Controlled: the picture held in the glass (0 is the first). */
  value?: number;
  /** Initial picture in the glass when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, wheel, key or click that brought a new picture into the glass. */
  onValueChange?: (index: number) => void;
  /** How far the glass splits a picture into colour fringes as it passes, 0 to 1. @default 0.6 */
  dispersion?: number;
  /** Width of the glass column, px; the held picture fits inside it. @default 150 */
  gateWidth?: number;
  /** The monochrome the pictures wear outside the glass. @default "graphite" */
  sideTone?: PrismGateTone;
  /** Gap between pictures on the rail, px. @default 14 */
  gap?: number;
  /** Picture width over height. @default 0.8 */
  ratio?: number;
  /** How much the pictures dim and shrink toward the frame's edges, 0 to 1. @default 0.45 */
  fade?: number;
  /** The glass's faint tint. @default "var(--accent-bright)" */
  glassTint?: string;
  /** Show the held picture's caption under the glass. @default true */
  captions?: boolean;
  /** The wheel moves the rail once the visitor has rested on it or tabbed in, and lets the page scroll at either end. @default true */
  wheel?: boolean;
  /** Height of the frame, px. @default 200 */
  height?: number;
  /** The rail's accessible name. @default "Pictures" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

/** Largest channel separation at full dispersion, px. */
const MAX_SPLIT = 9;
/** Rail speed (px/s) that splits a picture fully on its own. */
const FAST = 1400;
/** Pictures either side of the held one that get the colour layers at all. */
const NEAR = 2;
const HOVER_INTENT_MS = 350;
const WHEEL_BURST_MS = 220;
const CAPTION_H = 18;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** Luminance kept, re-inked: each tone is a colour matrix over the picture. */
const TONES: Record<
  PrismGateTone,
  { ink: [number, number, number]; lift: number; gain: number }
> = {
  graphite: { ink: [1, 1, 1], lift: 0, gain: 1 },
  sepia: { ink: [1.1, 0.93, 0.74], lift: 0.03, gain: 0.95 },
  cyano: { ink: [0.62, 0.84, 1.08], lift: 0.05, gain: 0.92 },
  paper: { ink: [1, 0.98, 0.94], lift: 0.3, gain: 0.62 },
};

function toneMatrix(tone: PrismGateTone): string {
  const { ink, lift, gain } = TONES[tone] ?? TONES.graphite;
  const w = [0.2126, 0.7152, 0.0722];
  const row = (k: number) =>
    `${r3(w[0]! * gain * k)} ${r3(w[1]! * gain * k)} ${r3(w[2]! * gain * k)} 0 ${r3(lift * k)}`;
  return `${row(ink[0])} ${row(ink[1])} ${row(ink[2])} 0 0 0 1 0`;
}

const CHANNEL = {
  r: "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0",
  g: "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0",
  b: "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0",
} as const;

/* ---------------------------------- art ---------------------------------- */

/** Nine drawn prints in full colour; the glass is where they get it. */
function Print({ index }: { index: number }) {
  const m = ((index % 9) + 9) % 9;
  const common = {
    viewBox: "0 0 80 100",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  if (m === 0)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--warn", 0.9, 0.06, -30) }}
        />
        <circle
          cx="54"
          cy="30"
          r="12"
          style={{ fill: pig("--danger", 0.66, 0.17, 10) }}
        />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <path
            key={k}
            d={`M-4 ${58 + k * 8} Q 40 ${50 + k * 8} 84 ${58 + k * 8}`}
            fill="none"
            style={{ stroke: pig("--success", 0.5 + k * 0.03, 0.13) }}
            strokeWidth="4"
          />
        ))}
      </svg>
    );
  if (m === 1)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--accent", 0.86, 0.06, -60) }}
        />
        <rect
          y="56"
          width="80"
          height="44"
          style={{ fill: pig("--accent", 0.5, 0.14) }}
        />
        {[12, 30, 50, 66].map((x, k) => (
          <g key={x}>
            <rect
              x={x}
              y={30 + (k % 2) * 6}
              width="1.6"
              height={26 - (k % 2) * 6}
              style={{ fill: pig("--accent", 0.3, 0.05) }}
            />
            <circle
              cx={x + 0.8}
              cy={30 + (k % 2) * 6}
              r="3"
              style={{ fill: pig("--warn", 0.85, 0.16) }}
            />
            <rect
              x={x - 1}
              y="60"
              width="3.6"
              height="22"
              rx="1.8"
              style={{ fill: pig("--warn", 0.8, 0.15) }}
              opacity={0.6}
            />
          </g>
        ))}
      </svg>
    );
  if (m === 2)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--success", 0.38, 0.09, 30) }}
        />
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <path
            key={k}
            d={`M${8 + k * 11} 100 C ${4 + k * 11} 70 ${16 + k * 11} 50 ${8 + k * 11} ${20 + (k % 3) * 8}`}
            fill="none"
            style={{ stroke: pig("--success", 0.62, 0.15, (k % 3) * 12) }}
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        ))}
        {[18, 46, 64].map((x) => (
          <circle
            key={x}
            cx={x}
            cy={14 + (x % 7)}
            r="2"
            style={{ fill: pig("--warn", 0.86, 0.12) }}
          />
        ))}
      </svg>
    );
  if (m === 3)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--warn", 0.82, 0.12) }}
        />
        {[0, 1, 2, 3].map((k) => (
          <path
            key={k}
            d={`M-6 ${40 + k * 16} C 20 ${24 + k * 16} 50 ${54 + k * 16} 86 ${36 + k * 16} V100 H-6 Z`}
            style={{ fill: pig("--warn", 0.74 - k * 0.08, 0.13, -10 - k * 6) }}
          />
        ))}
        <circle
          cx="22"
          cy="20"
          r="8"
          style={{ fill: pig("--warn", 0.97, 0.05) }}
        />
      </svg>
    );
  if (m === 4)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--success", 0.85, 0.08) }}
        />
        {[0, 1, 2, 3, 4].map((k) => (
          <path
            key={k}
            d={`M-4 ${30 + k * 16} q 21 -10 42 0 t 44 0`}
            fill="none"
            style={{ stroke: pig("--success", 0.48, 0.14, -k * 8) }}
            strokeWidth="6"
          />
        ))}
        <rect
          x="56"
          y="8"
          width="16"
          height="14"
          rx="2"
          style={{ fill: pig("--danger", 0.6, 0.17) }}
        />
      </svg>
    );
  if (m === 5)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--accent", 0.92, 0.03) }}
        />
        <path
          d="M10 100 V44 L40 22 L70 44 V100 Z"
          style={{ fill: pig("--success", 0.72, 0.1) }}
          opacity={0.5}
        />
        {[0, 1, 2, 3].map((k) => (
          <path
            key={k}
            d={`M${10 + k * 20} 100 V${44 - (k === 1 || k === 2 ? 14 : 0)}`}
            style={{ stroke: pig("--accent", 0.4, 0.05) }}
            strokeWidth="1"
          />
        ))}
        <path
          d="M10 44 L40 22 L70 44 M10 70 H70"
          fill="none"
          style={{ stroke: pig("--accent", 0.4, 0.05) }}
          strokeWidth="1"
        />
        {[20, 34, 52, 60].map((x, k) => (
          <circle
            key={x}
            cx={x}
            cy={82 - k * 4}
            r={6 + (k % 2) * 3}
            style={{ fill: pig("--danger", 0.62, 0.17, k * 30) }}
          />
        ))}
      </svg>
    );
  if (m === 6)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--accent", 0.28, 0.08) }}
        />
        {[0, 1, 2, 3, 4].map((k) => (
          <path
            key={k}
            d={`M${k * 18 - 4} 30 h16 l-2 10 h-12 z`}
            style={{ fill: pig("--danger", 0.62, 0.17, k * 40) }}
          />
        ))}
        {[0, 1, 2, 3, 4].map((k) => (
          <circle
            key={k}
            cx={k * 18 + 4}
            cy="54"
            r="3"
            style={{ fill: pig("--warn", 0.88, 0.15) }}
          />
        ))}
        <rect
          y="74"
          width="80"
          height="26"
          style={{ fill: pig("--accent", 0.2, 0.05) }}
        />
      </svg>
    );
  if (m === 7)
    return (
      <svg {...common}>
        <rect
          width="80"
          height="100"
          style={{ fill: pig("--accent", 0.6, 0.15, -30) }}
        />
        {Array.from({ length: 12 }, (_, k) => (
          <path
            key={k}
            d={`M${(k * 23) % 80} ${30 + ((k * 37) % 60)} c 3 -12 8 -14 6 -26`}
            fill="none"
            style={{ stroke: pig("--warn", 0.75, 0.16, -40 + (k % 3) * 30) }}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        ))}
      </svg>
    );
  return (
    <svg {...common}>
      <rect
        width="80"
        height="100"
        style={{ fill: pig("--success", 0.7, 0.13) }}
      />
      {Array.from({ length: 14 }, (_, k) => {
        const x = (k * 29) % 80;
        const y = 20 + ((k * 41) % 76);
        return (
          <g key={k}>
            <path
              d={`M${x} ${y} v${10 + (k % 3) * 3}`}
              style={{ stroke: pig("--success", 0.42, 0.1) }}
              strokeWidth="1"
            />
            <circle
              cx={x}
              cy={y}
              r={3 + (k % 2)}
              style={{ fill: pig("--danger", 0.6, 0.2) }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export const defaultPrismGateItems: PrismGateItem[] = [
  { alt: "Terraced rows under a red sun", caption: "Tea terraces" },
  { alt: "Harbour lamps over a blue bay", caption: "Harbour lamps" },
  { alt: "Kelp swaying in green water", caption: "Kelp forest" },
  { alt: "Dunes in layered amber light", caption: "Dune shadows" },
  { alt: "Rows of green waves with a red flag", caption: "Orchard rows" },
  { alt: "A glasshouse full of bright flowers", caption: "Glasshouse" },
  { alt: "A night market under coloured awnings", caption: "Night market" },
  { alt: "Orange grass on a violet evening", caption: "Prairie fire" },
  { alt: "Poppies across a green field", caption: "Poppy field" },
];

/* --------------------------------- rail ---------------------------------- */

type Plate = {
  x: MotionValue<number>;
  scale: MotionValue<number>;
  opacity: MotionValue<number>;
  clip: MotionValue<string>;
  colour: MotionValue<string>;
  plain: MotionValue<string>;
  split: MotionValue<string>;
  red: MotionValue<number>;
  blue: MotionValue<number>;
};

type Geo = {
  w: number;
  h: number;
  gate: number;
  cw: number;
  ch: number;
  pitch: number;
  top: number;
};

function geometry(
  width: number,
  height: number,
  gateWidth: number,
  ratio: number,
  gap: number,
  captions: boolean,
): Geo {
  const w = Math.max(200, Math.round(width));
  const h = Math.max(120, Math.round(height));
  const gate = Math.round(clamp(gateWidth, 80, w * 0.62));
  const avail = h - 30 - (captions ? CAPTION_H : 0);
  let cw = gate - 20;
  let ch = cw / clamp(ratio, 0.4, 2);
  if (ch > avail) {
    ch = avail;
    cw = ch * clamp(ratio, 0.4, 2);
  }
  cw = Math.round(cw);
  ch = Math.round(ch);
  return {
    w,
    h,
    gate,
    cw,
    ch,
    pitch: cw + clamp(Math.round(gap), 0, 80),
    top: Math.round(15 + (avail - ch) / 2),
  };
}

/** Everything a picture's layers need at rail offset `x` (its centre from the glass's). */
function poseOf(
  g: Geo,
  x: number,
  velocity: number,
  dispersion: number,
  fade: number,
  motionSafe: boolean,
) {
  const half = g.cw / 2;
  const left = Math.max(0, -g.gate / 2 - (x - half));
  const right = Math.max(0, x + half - g.gate / 2);
  const inGlass = left + right < g.cw - 0.5;
  const transit = Math.abs(x) / (half + g.gate / 2);
  // Light only splits through glass while the picture is moving: at rest a
  // neighbour that reaches into the glass is simply in colour there.
  const moving = clamp01(Math.abs(velocity) / 120);
  const passing = transit < 1 ? Math.sin(Math.PI * transit) * moving : 0;
  const rushing = clamp01(Math.abs(velocity) / FAST);
  const split = motionSafe
    ? clamp01(dispersion) * MAX_SPLIT * Math.max(passing, rushing)
    : 0;
  const dir =
    Math.abs(velocity) > 40 ? -Math.sign(velocity) : Math.sign(x) || 1;
  const far = smooth(g.gate / 2, g.w / 2 + half, Math.abs(x));
  return {
    x: r2(x),
    scale: r3(1 - 0.08 * clamp01(fade) * far),
    opacity: r3(1 - 0.6 * clamp01(fade) * far),
    clip: `inset(0px ${r2(Math.min(g.cw, right))}px 0px ${r2(Math.min(g.cw, left))}px)`,
    colour: inGlass ? "visible" : "hidden",
    plain: inGlass && split < 0.25 ? "visible" : "hidden",
    splitVis: inGlass && split >= 0.25 ? "visible" : "hidden",
    red: r2(-dir * split),
    blue: r2(dir * split),
  };
}

type Api = { draw: () => void; wheel: (event: WheelEvent) => void };

/**
 * A rail of pictures runs through a glass prism standing at the centre of
 * the frame. Outside the glass they are quiet monochrome in the `sideTone`,
 * a little smaller and dimmer toward the edges; behind the glass they are in
 * colour, cut exactly at its faces, so a picture sliding in takes its colour
 * from the leading edge. While it is part-way through, the glass splits it:
 * three channel copies, isolated with colour matrices and added back with
 * screen blending over black, separate along the way it travels — most at
 * mid-transit and at speed — and close up as it centres, where it holds in
 * full, resolved colour as the active picture.
 *
 * Drag follows 1:1 and rubber-bands at the ends, a flick projects and settles
 * on the nearest picture on `springs.glide` with the release velocity, and
 * the wheel moves the rail once the visitor has settled on it. It is a
 * carousel: Left and Right step, Page keys step three, Home and End go to
 * the ends, and a click on a picture brings it to the glass. At rest each
 * picture is one layer; the channel copies exist only while one is splitting.
 * Under reduced motion the rail steps at once and the glass never splits: the
 * held picture is in colour and the rest monochrome.
 */
export function PrismGate({
  items = defaultPrismGateItems,
  value,
  defaultValue = 0,
  onValueChange,
  dispersion = 0.6,
  gateWidth = 150,
  sideTone = "graphite",
  gap = 14,
  ratio = 0.8,
  fade = 0.45,
  glassTint = "var(--accent-bright)",
  captions = true,
  wheel = true,
  height = 200,
  label = "Pictures",
  disabled = false,
  className,
}: PrismGateProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const toneId = `${uid}-tone`;
  const list = items.length > 0 ? items : defaultPrismGateItems;
  const n = list.length;

  const [width, setWidth] = React.useState(720);
  const g = React.useMemo(
    () => geometry(width, height, gateWidth, ratio, gap, captions),
    [width, height, gateWidth, ratio, gap, captions],
  );
  const maxPos = (n - 1) * g.pitch;
  const start = clamp(Math.round(value ?? defaultValue), 0, n - 1);

  /** Rail travel, px: the held picture's index times the pitch at rest. */
  const pos = useMotionValue(start * g.pitch);
  const glint = useMotionValue(0);
  // The faces always carry a little spectrum, more the more the glass
  // disperses, and flare while a picture splits.
  const glintOpacity = useTransform(glint, (k) => {
    const d = clamp01(dispersion);
    return r3(Math.min(1, 0.1 + 0.5 * d + 0.6 * clamp01(k) * d));
  });

  const plates = React.useMemo<Plate[]>(() => {
    const p0 = pos.get();
    return list.map((_, i) => {
      const pose = poseOf(g, i * g.pitch - p0, 0, 0, fade, false);
      return {
        x: motionValue(pose.x),
        scale: motionValue(pose.scale),
        opacity: motionValue(pose.opacity),
        clip: motionValue(pose.clip),
        colour: motionValue(pose.colour),
        plain: motionValue(pose.plain),
        split: motionValue(pose.splitVis),
        red: motionValue(0),
        blue: motionValue(0),
      };
    });
    // The values seed the first frame; draw() keeps them current after that.
  }, [list, pos, g, fade]);

  const [current, setCurrent] = React.useState(start);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const settling = React.useRef<AnimationPlaybackControls | null>(null);
  const target = React.useRef(start);
  const currentRef = React.useRef(start);
  const reported = React.useRef<number | null>(null);
  const visitor = React.useRef(false);
  const dragFrom = React.useRef(0);
  const wheelTimer = React.useRef<number | null>(null);
  const restTimer = React.useRef<number | null>(null);
  const state = React.useRef({
    hovered: false,
    hoverSince: 0,
    focused: false,
    lastWheel: 0,
    wheelTaken: false,
  });

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const caption = (i: number) => list[i]?.caption ?? list[i]?.alt ?? "";

  const draw = () => {
    const p = pos.get();
    const vel = motionSafe ? pos.getVelocity() : 0;
    let strongest = 0;
    plates.forEach((plate, i) => {
      const pose = poseOf(
        g,
        i * g.pitch - p,
        vel,
        dispersion,
        fade,
        motionSafe,
      );
      plate.x.set(pose.x);
      plate.scale.set(pose.scale);
      plate.opacity.set(pose.opacity);
      plate.clip.set(pose.clip);
      plate.colour.set(pose.colour);
      plate.plain.set(pose.plain);
      plate.split.set(pose.splitVis);
      plate.red.set(pose.red);
      plate.blue.set(pose.blue);
      if (pose.colour === "visible") {
        strongest = Math.max(strongest, Math.abs(pose.red) / MAX_SPLIT);
      }
    });
    glint.set(r3(strongest));
    // Speed is read from the last frames, so the last move of a gesture or
    // a spring still reads as moving: redraw once the rail has been still
    // long enough to read as rest, and the split closes up.
    if (vel !== 0) {
      if (restTimer.current !== null) window.clearTimeout(restTimer.current);
      restTimer.current = window.setTimeout(() => {
        restTimer.current = null;
        api.current?.draw();
      }, 80);
    }
    const idx = clamp(Math.round(p / g.pitch), 0, n - 1);
    if (idx !== currentRef.current) {
      currentRef.current = idx;
      setCurrent(idx);
      reported.current = idx;
      onValueChange?.(idx);
      if (visitor.current) say(`${idx + 1} of ${n}: ${caption(idx)}.`);
    }
  };

  const halt = () => {
    settling.current?.stop();
    settling.current = null;
  };

  const settleTo = (index: number, velocity = 0) => {
    halt();
    const i = clamp(index, 0, n - 1);
    target.current = i;
    const to = i * g.pitch;
    if (!motionSafe) {
      pos.jump(to);
      visitor.current = false;
      return;
    }
    settling.current = animate(pos, to, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        settling.current = null;
        visitor.current = false;
      },
    });
  };

  const step = (delta: number) => {
    visitor.current = true;
    const from = settling.current
      ? target.current
      : Math.round(pos.get() / g.pitch);
    settleTo(from + delta);
  };

  const takeWheel = (event: WheelEvent) => {
    const k = state.current;
    const now = performance.now();
    if (now - k.lastWheel > WHEEL_BURST_MS) {
      k.wheelTaken =
        wheel &&
        !disabled &&
        (k.focused || (k.hovered && now - k.hoverSince > HOVER_INTENT_MS));
    }
    k.lastWheel = now;
    if (!k.wheelTaken) return;
    const { x: wx, y: wy } = wheelPixels(event);
    const delta = Math.abs(wx) > Math.abs(wy) ? wx : wy;
    const p = pos.get();
    if ((delta < 0 && p <= 0.5) || (delta > 0 && p >= maxPos - 0.5)) return;
    event.preventDefault();
    halt();
    visitor.current = true;
    pos.set(clamp(p + delta, 0, maxPos));
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      settleTo(Math.round(pos.get() / g.pitch));
    }, 140);
  };

  React.useEffect(() => {
    api.current = { draw, wheel: takeWheel };
  });

  /* ------------------------------ effects ------------------------------ */

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) setWidth(Math.round(box.width));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => pos.on("change", () => api.current?.draw()), [pos]);

  React.useEffect(() => {
    if (!settling.current) pos.jump(currentRef.current * g.pitch);
    api.current?.draw();
  }, [g, dispersion, fade, plates, pos, motionSafe]);

  React.useEffect(() => {
    if (value === undefined) return;
    const k = clamp(Math.round(value), 0, n - 1);
    if (k === reported.current || k === currentRef.current) return;
    reported.current = k;
    settling.current?.stop();
    target.current = k;
    if (!motionSafe) pos.jump(k * g.pitch);
    else settling.current = animate(pos, k * g.pitch, springs.glide);
  }, [value, n, pos, motionSafe, g.pitch]);

  React.useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current?.wheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  React.useEffect(
    () => () => {
      settling.current?.stop();
      settling.current = null;
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      if (restTimer.current !== null) window.clearTimeout(restTimer.current);
      wheelTimer.current = null;
      restTimer.current = null;
    },
    [],
  );

  /* ------------------------------ gestures ----------------------------- */

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      halt();
      visitor.current = true;
      dragFrom.current = pos.get();
    },
    onMove: ({ offset }) => {
      pos.set(rubberClamp(dragFrom.current - offset.x, 0, maxPos, g.pitch));
    },
    onEnd: ({ velocity }) => {
      const p = pos.get();
      const rest = motionSafe ? project(p, -velocity.x, 0.997) : p;
      settleTo(Math.round(rest / g.pitch), motionSafe ? -velocity.x : 0);
    },
    onCancel: () => settleTo(Math.round(pos.get() / g.pitch)),
    onTap: (event) => {
      const hit =
        event.target instanceof Element
          ? event.target.closest("[data-plate]")
          : null;
      if (!hit) return;
      const i = Number(hit.getAttribute("data-plate"));
      if (!Number.isFinite(i)) return;
      visitor.current = true;
      settleTo(i);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const keys: Record<string, () => void> = {
      ArrowRight: () => step(1),
      ArrowDown: () => step(1),
      ArrowLeft: () => step(-1),
      ArrowUp: () => step(-1),
      PageDown: () => step(3),
      PageUp: () => step(-3),
      Home: () => {
        visitor.current = true;
        settleTo(0);
      },
      End: () => {
        visitor.current = true;
        settleTo(n - 1);
      },
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  };

  /* ------------------------------- render ------------------------------ */

  const cx = g.w / 2;
  const gL = r2(cx - g.gate / 2);
  const gR = r2(cx + g.gate / 2);
  const capTop = Math.max(4, g.top - 10);
  const capBottom = Math.min(
    g.h - (captions ? CAPTION_H : 0) - 4,
    g.top + g.ch + 10,
  );
  const tint = `color-mix(in oklab, ${glassTint} 8%, transparent)`;
  const spectrum = `linear-gradient(to bottom, ${pig("--danger", 0.7, 0.18)}, ${pig("--warn", 0.82, 0.16)}, ${pig("--success", 0.75, 0.15)}, ${pig("--accent", 0.65, 0.18)}, ${pig("--accent", 0.6, 0.2, 40)})`;

  const picture = (item: PrismGateItem, i: number) =>
    item.src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt=""
        draggable={false}
        className="block size-full object-cover"
      />
    ) : (
      (item.art ?? <Print index={i} />)
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => {
        state.current.hovered = true;
        state.current.hoverSince = performance.now();
      }}
      onPointerLeave={() => {
        state.current.hovered = false;
      }}
      onFocus={(event) => {
        state.current.focused = event.target.matches(":focus-visible");
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          state.current.focused = false;
        }
      }}
      className={cn(
        "relative w-full overflow-clip rounded-4 border border-hairline bg-surface-1 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height: g.h }}
    >
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id={toneId} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={toneMatrix(sideTone)} />
          </filter>
          {(["r", "g", "b"] as const).map((c) => (
            <filter key={c} id={`${uid}-${c}`} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={CHANNEL[c]} />
            </filter>
          ))}
        </defs>
      </svg>
      <p id={hintId} className="sr-only">
        Left and Right move the rail a picture at a time, Page Up and Page Down
        by three, Home and End to the ends.
      </p>

      <div
        ref={viewRef}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        aria-label={`${label}: ${current + 1} of ${n}, ${caption(current)}`}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "absolute inset-0 touch-pan-y rounded-4 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      >
        {list.map((item, i) => {
          const plate = plates[i];
          if (!plate) return null;
          const near = Math.abs(i - current) <= NEAR;
          return (
            <motion.div
              key={i}
              data-plate={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}: ${caption(i)}`}
              aria-hidden={i !== current || undefined}
              className="absolute overflow-hidden rounded-2 bg-surface-2"
              style={{
                left: r2(cx - g.cw / 2),
                top: g.top,
                width: g.cw,
                height: g.ch,
                x: plate.x,
                scale: plate.scale,
                opacity: plate.opacity,
              }}
            >
              <div
                role="img"
                aria-label={item.alt}
                className="absolute inset-0"
                style={{ filter: `url(#${toneId})` }}
              >
                {picture(item, i)}
              </div>
              {near ? (
                <motion.div
                  aria-hidden
                  className="absolute inset-0"
                  style={{ clipPath: plate.clip, visibility: plate.colour }}
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{ visibility: plate.plain }}
                  >
                    {picture(item, i)}
                  </motion.div>
                  <motion.div
                    className="absolute inset-0 isolate bg-black"
                    style={{ visibility: plate.split }}
                  >
                    {(["r", "g", "b"] as const).map((c) => (
                      <motion.div
                        key={c}
                        className="absolute inset-0 mix-blend-screen"
                        style={{
                          filter: `url(#${uid}-${c})`,
                          x: c === "r" ? plate.red : c === "b" ? plate.blue : 0,
                        }}
                      >
                        {picture(item, i)}
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              ) : null}
            </motion.div>
          );
        })}

        {/* The glass: two faces meeting at a soft ridge, bevelled caps and a
            spectral glint on each face that wakes as a picture splits. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute rounded-2 border-x border-hairline-strong"
            style={{
              left: gL,
              width: g.gate,
              top: capTop,
              height: capBottom - capTop,
              background: `linear-gradient(to right, color-mix(in oklab, white 16%, transparent), transparent 46%, color-mix(in oklab, black 5%, transparent) 54%, color-mix(in oklab, black 9%, transparent)), ${tint}`,
              boxShadow:
                "inset 0 1px 0 color-mix(in oklab, white 45%, transparent), inset 0 -1px 0 color-mix(in oklab, black 10%, transparent)",
            }}
          />
          <div
            className="absolute w-px"
            style={{
              left: r2(cx - 0.5),
              top: capTop,
              height: capBottom - capTop,
              background:
                "linear-gradient(to bottom, transparent, color-mix(in oklab, white 55%, transparent) 20%, color-mix(in oklab, white 30%, transparent) 80%, transparent)",
            }}
          />
          {[gL, r2(gR - 3)].map((x) => (
            <motion.div
              key={x}
              className="absolute w-1 rounded-full"
              style={{
                left: x,
                top: g.top,
                height: g.ch,
                background: spectrum,
                opacity: glintOpacity,
              }}
            />
          ))}
          <div
            className="absolute rounded-t-2 border-x border-t border-hairline-strong"
            style={{
              left: gL,
              width: g.gate,
              top: capTop,
              height: 6,
              background: "color-mix(in oklab, white 30%, transparent)",
            }}
          />
          <div
            className="absolute rounded-b-2 border-x border-b border-hairline-strong"
            style={{
              left: gL,
              width: g.gate,
              top: capBottom - 6,
              height: 6,
              background: "color-mix(in oklab, black 8%, transparent)",
            }}
          />
        </div>

        {captions ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 grid justify-items-center"
            style={{ bottom: 6, height: CAPTION_H - 4 }}
          >
            {list.map((_, i) => (
              <span
                key={i}
                className="col-start-1 row-start-1 max-w-full truncate px-3 font-mono text-[10px] leading-[14px] tracking-[0.08em] text-ink-2 uppercase transition-opacity"
                style={{
                  opacity: i === current ? 1 : 0,
                  transitionDuration: `${Math.round((motionSafe ? durations.base : durations.fast) * 1000)}ms`,
                  transitionTimingFunction: `cubic-bezier(${easings.enter.join(",")})`,
                }}
              >
                {caption(i)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
