"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type IceFloesItem = {
  /** An image URL; without one a postcard is drawn in code. */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** The caption read when the floe is lifted. */
  caption?: string;
  /** A second line under the caption: archive, year. */
  note?: string;
};

export type IceFloesProps = {
  /** The pictures, one per floe, repeating across the field. @default ten postcards drawn in code */
  items?: IceFloesItem[];
  /** Controlled: the item whose floe is lifted out of the water, or null. */
  value?: number | null;
  /** Initial lifted item when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that lifted or lowered a floe. */
  onValueChange?: (index: number | null) => void;
  /** How crowded the water is, 0.2 (scattered) to 1 (packed). @default 0.6 */
  density?: number;
  /** How fast the current carries the field, 0 (still water) to 1. @default 0.35 */
  drift?: number;
  /** The water's hue in degrees, at a fixed dark lightness. @default 215 */
  tint?: number;
  /** The way the floes travel on screen, degrees clockwise from up: 180 comes straight toward you. @default 200 */
  heading?: number;
  /** How steeply you look down at the water, degrees from straight down, 35 to 62. @default 50 */
  tilt?: number;
  /** Floe size, 0.7 to 1.4. @default 1 */
  size?: number;
  /** How much the floes lag, bump and turn when the water is moved, 0 to 1. @default 0.5 */
  jostle?: number;
  /** How quickly a fling glides to a stop: 0 glides long, 1 stops short. @default 0.5 */
  friction?: number;
  /** The field's accessible name. @default "Ice floes" */
  label?: string;
  /** Still water: no current and no bobbing; a drag still moves the field. @default false */
  paused?: boolean;
  /** No dragging, lifting or keys. @default false */
  disabled?: boolean;
  /** Seeds the floes' shapes and places. @default 7 */
  seed?: number;
  /** Classes for the root; give it a height. */
  className?: string;
};

export const defaultIceItems: IceFloesItem[] = [
  {
    alt: "Puffins on a rock above a grey sea",
    caption: "Puffin rock",
    note: "Fieldline Archive, 1924",
  },
  {
    alt: "A lighthouse on a dark headland at dusk",
    caption: "The light at Kell Point",
    note: "Fieldline Archive, 1921",
  },
  {
    alt: "A whaling ship held in the pack ice",
    caption: "A whaler in the pack",
    note: "Fieldline Archive, 1927",
  },
  {
    alt: "Green aurora over a small research station",
    caption: "Aurora over the station",
    note: "Fieldline Archive, 1931",
  },
  {
    alt: "A seal resting on a sunlit floe",
    caption: "A seal on the ice",
    note: "Fieldline Archive, 1925",
  },
  {
    alt: "Steep mountains around a fjord at dawn",
    caption: "The fjord at dawn",
    note: "Fieldline Archive, 1929",
  },
  {
    alt: "A snow hut under a starry sky",
    caption: "Snow hut",
    note: "Fieldline Archive, 1933",
  },
  {
    alt: "A supply ship with a red hull at anchor",
    caption: "The supply ship",
    note: "Fieldline Archive, 1922",
  },
  {
    alt: "A watchtower lamp under a full moon",
    caption: "The night watch",
    note: "Fieldline Archive, 1934",
  },
  {
    alt: "The blue face of a glacier meeting the sea",
    caption: "The glacier face",
    note: "Fieldline Archive, 1928",
  },
];

/** One postcard drawn in code: flat shapes in fixed pigments. */
function Postcard({ index }: { index: number }) {
  const k = ((index % 10) + 10) % 10;
  const common = {
    viewBox: "0 0 120 90",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  if (k === 0)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.84 0.02 230)" />
        <rect y="58" width="120" height="32" fill="oklch(0.52 0.03 235)" />
        <path
          d="M 10 90 L 26 48 L 60 40 L 92 54 L 104 90 Z"
          fill="oklch(0.34 0.02 60)"
        />
        <ellipse cx="54" cy="36" rx="7" ry="9" fill="oklch(0.18 0.01 260)" />
        <circle cx="54" cy="25" r="5.5" fill="oklch(0.18 0.01 260)" />
        <circle cx="55.5" cy="25" r="3.2" fill="oklch(0.95 0.01 90)" />
        <path d="M 58 26 l 6 1.5 l -6 2 z" fill="oklch(0.66 0.18 45)" />
        <ellipse cx="75" cy="43" rx="5" ry="7" fill="oklch(0.18 0.01 260)" />
        <circle cx="75" cy="34" r="4.5" fill="oklch(0.18 0.01 260)" />
        <path d="M 78.5 34.5 l 5 1 l -5 1.6 z" fill="oklch(0.66 0.18 45)" />
      </svg>
    );
  if (k === 1)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.62 0.08 30)" />
        <rect width="120" height="40" fill="oklch(0.5 0.07 290)" />
        <rect y="64" width="120" height="26" fill="oklch(0.36 0.05 250)" />
        <path d="M 52 66 L 100 52 L 120 66 Z" fill="oklch(0.22 0.02 260)" />
        <path
          d="M 80 56 L 82 22 L 90 22 L 92 56 Z"
          fill="oklch(0.94 0.01 90)"
        />
        <rect x="81" y="32" width="10" height="5" fill="oklch(0.55 0.17 28)" />
        <path d="M 79 22 L 86 14 L 93 22 Z" fill="oklch(0.22 0.02 260)" />
        <path d="M 86 18 L 10 8 L 10 26 Z" fill="oklch(0.95 0.08 90 / 0.5)" />
      </svg>
    );
  if (k === 2)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.86 0.015 240)" />
        <rect y="50" width="120" height="40" fill="oklch(0.95 0.01 230)" />
        <path
          d="M 0 56 h 30 l 6 4 h 30 l 8 -3 h 46 V 90 H 0 Z"
          fill="oklch(0.88 0.02 230)"
        />
        <path d="M 40 52 h 44 l -6 10 h -32 z" fill="oklch(0.28 0.03 40)" />
        <path
          d="M 60 52 V 18 M 48 52 V 28 M 72 52 V 26"
          stroke="oklch(0.25 0.02 40)"
          strokeWidth="1.6"
        />
        <path
          d="M 60 22 l -10 22 h 10 z M 72 28 l 8 18 h -8 z"
          fill="oklch(0.93 0.01 80)"
        />
      </svg>
    );
  if (k === 3)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.2 0.04 265)" />
        <path
          d="M 0 30 Q 30 10 60 26 T 120 18 L 120 46 Q 90 34 60 46 T 0 50 Z"
          fill="oklch(0.72 0.16 160 / 0.55)"
        />
        <path
          d="M 10 40 Q 40 24 70 36 T 120 32 L 120 52 Q 80 44 50 56 T 0 58 Z"
          fill="oklch(0.62 0.14 175 / 0.4)"
        />
        <rect y="66" width="120" height="24" fill="oklch(0.9 0.015 240)" />
        <path
          d="M 74 66 v -10 l 10 -6 l 10 6 v 10 z"
          fill="oklch(0.32 0.04 30)"
        />
        <rect x="80" y="58" width="4" height="4" fill="oklch(0.85 0.12 85)" />
      </svg>
    );
  if (k === 4)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.55 0.06 230)" />
        <path
          d="M 8 60 L 30 44 L 96 42 L 116 62 L 90 72 L 22 74 Z"
          fill="oklch(0.95 0.01 220)"
        />
        <ellipse cx="62" cy="50" rx="18" ry="6" fill="oklch(0.42 0.02 60)" />
        <circle cx="78" cy="46" r="5" fill="oklch(0.42 0.02 60)" />
        <circle cx="80" cy="45" r="0.9" fill="oklch(0.12 0 0)" />
      </svg>
    );
  if (k === 5)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.8 0.06 20)" />
        <rect width="120" height="30" fill="oklch(0.72 0.06 300)" />
        <path
          d="M 0 60 L 22 18 L 44 54 L 66 28 L 92 62 L 120 24 V 64 H 0 Z"
          fill="oklch(0.34 0.03 270)"
        />
        <path
          d="M 22 18 l 6 12 l -12 0 z M 66 28 l 6 10 l -12 0 z"
          fill="oklch(0.95 0.01 260)"
        />
        <rect y="62" width="120" height="28" fill="oklch(0.6 0.05 300)" />
        <path
          d="M 0 66 H 120 M 10 72 H 100 M 30 78 H 120"
          stroke="oklch(0.85 0.04 30 / 0.6)"
          strokeWidth="1"
        />
      </svg>
    );
  if (k === 6)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.24 0.04 260)" />
        {[14, 30, 52, 70, 88, 104, 40, 96].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={10 + ((i * 13) % 34)}
            r="0.9"
            fill="oklch(0.95 0.03 90)"
          />
        ))}
        <rect y="62" width="120" height="28" fill="oklch(0.9 0.02 240)" />
        <path d="M 38 64 A 22 18 0 0 1 82 64 Z" fill="oklch(0.97 0.01 240)" />
        <path d="M 52 64 a 8 8 0 0 1 16 0 z" fill="oklch(0.3 0.04 250)" />
        <path
          d="M 42 56 h 36 M 46 50 h 28"
          stroke="oklch(0.8 0.02 240)"
          strokeWidth="0.8"
        />
      </svg>
    );
  if (k === 7)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.82 0.03 220)" />
        <rect y="58" width="120" height="32" fill="oklch(0.42 0.05 230)" />
        <path d="M 24 58 h 72 l -8 12 h -56 z" fill="oklch(0.5 0.17 27)" />
        <rect x="40" y="44" width="30" height="14" fill="oklch(0.95 0.01 90)" />
        <rect x="74" y="36" width="5" height="22" fill="oklch(0.3 0.02 260)" />
        <path d="M 30 58 h 66" stroke="oklch(0.95 0.01 90)" strokeWidth="1" />
      </svg>
    );
  if (k === 8)
    return (
      <svg {...common}>
        <rect width="120" height="90" fill="oklch(0.28 0.04 255)" />
        <circle cx="88" cy="22" r="10" fill="oklch(0.94 0.04 90)" />
        <rect y="60" width="120" height="30" fill="oklch(0.22 0.04 250)" />
        <path
          d="M 84 64 h 8 M 80 70 h 16 M 86 76 h 6"
          stroke="oklch(0.9 0.04 90 / 0.6)"
          strokeWidth="1"
        />
        <path d="M 22 64 V 30 h 12 V 64 Z" fill="oklch(0.16 0.02 260)" />
        <rect x="25" y="34" width="6" height="5" fill="oklch(0.85 0.14 80)" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect width="120" height="90" fill="oklch(0.88 0.02 230)" />
      <path
        d="M 0 22 L 30 18 L 50 26 L 80 16 L 120 24 V 62 H 0 Z"
        fill="oklch(0.78 0.07 225)"
      />
      <path
        d="M 14 22 V 62 M 36 20 V 62 M 58 24 V 62 M 84 18 V 62 M 104 22 V 62"
        stroke="oklch(0.66 0.08 230)"
        strokeWidth="1.2"
      />
      <rect y="62" width="120" height="28" fill="oklch(0.42 0.06 225)" />
      <path
        d="M 20 70 h 12 l 2 3 h -16 z M 70 76 h 18 l 2 3 h -22 z"
        fill="oklch(0.95 0.01 220)"
      />
    </svg>
  );
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrap = (v: number, lo: number, span: number) =>
  ((((v - lo) % span) + span) % span) + lo;

function mulberry(seed: number) {
  let s = (Math.floor(seed * 104729) ^ 0x2c1b3c6d) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Floe = {
  id: number;
  r: number;
  shape: string;
  points: string;
  item: number;
  turn: number;
};

type Layout = {
  w: number;
  h: number;
  rBar: number;
  floes: Floe[];
};

type View = {
  w: number;
  h: number;
  p: number;
  y0: number;
  sin: number;
  cos: number;
  tilt: number;
  tileX: number;
  tileY: number;
  yTop: number;
  yFar: number;
  yNear: number;
};

const viewOf = (w: number, h: number, tiltDeg: number, rBar: number): View => {
  const tilt = clamp(tiltDeg, 35, 62);
  const a = (tilt * Math.PI) / 180;
  const sin = Math.sin(a);
  const cos = Math.cos(a);
  const p = h * 1.7;
  const y0 = h * 0.6;
  // The plane under the top and bottom edges of the box.
  const top = -y0;
  const yFar = (top * p) / (p * cos + top * sin);
  const bottom = h - y0;
  const yNear = (bottom * p) / (p * cos + bottom * sin);
  const sFar = p / (p - yFar * sin);
  const margin = rBar * 1.7;
  const tileX = (w / sFar) * 1.06 + margin * 2;
  const yTop = yFar - margin;
  const tileY = yNear + margin - yTop;
  return { w, h, p, y0, sin, cos, tilt, tileX, tileY, yTop, yFar, yNear };
};

/** The point on the water under a point of the box (box px). */
const planeAt = (v: View, x: number, y: number): [number, number] => {
  const k = y - v.y0;
  const py = (k * v.p) / (v.p * v.cos + k * v.sin);
  const s = v.p / (v.p - py * v.sin);
  return [(x - v.w / 2) / s, py];
};

/** Where a point on the water lands in the box. */
const screenOf = (v: View, x: number, y: number): [number, number, number] => {
  const s = v.p / (v.p - y * v.sin);
  return [v.w / 2 + x * s, v.y0 + y * v.cos * s, s];
};

function buildLayout(
  w: number,
  h: number,
  seed: number,
  density: number,
  size: number,
  tilt: number,
  count: number,
): Layout {
  const rBar = clamp(w * 0.095, 46, 88) * clamp(size, 0.7, 1.4);
  const v = viewOf(w, h, tilt, rBar);
  const rand = mulberry(seed);
  const area = v.tileX * v.tileY;
  const n = Math.round(
    clamp(
      (clamp(density, 0.2, 1) * 0.42 * area) / (Math.PI * rBar * rBar),
      6,
      48,
    ),
  );
  const floes: Floe[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = Math.round(rBar * (0.72 + rand() * 0.56));
    const pts: string[] = [];
    const svg: string[] = [];
    // An irregular outline: many corners, their reach wandering smoothly
    // round the floe so it reads as broken ice, not a polygon.
    const sides = 12 + Math.floor(rand() * 4);
    const lobes = 2 + Math.floor(rand() * 3);
    const tilt0 = rand() * Math.PI * 2;
    for (let k = 0; k < sides; k += 1) {
      const a = ((k + (rand() - 0.5) * 0.6) / sides) * Math.PI * 2;
      const f = clamp(
        0.86 + 0.09 * Math.sin(a * lobes + tilt0) + (rand() - 0.5) * 0.12,
        0.68,
        1,
      );
      const x = Math.round((50 + 50 * f * Math.cos(a)) * 10) / 10;
      const y = Math.round((50 + 50 * f * Math.sin(a)) * 10) / 10;
      pts.push(`${x}% ${y}%`);
      svg.push(`${x},${y}`);
    }
    floes.push({
      id: i,
      r,
      shape: `polygon(${pts.join(", ")})`,
      points: svg.join(" "),
      item: i % Math.max(1, count),
      turn: Math.round((rand() - 0.5) * 16),
    });
  }
  return { w, h, rBar, floes };
}

type Config = {
  drift: number;
  heading: number;
  tilt: number;
  jostle: number;
  friction: number;
  paused: boolean;
  disabled: boolean;
  motionSafe: boolean;
};

type Engine = {
  setLayout: (
    layout: Layout,
    nodes: Map<number, HTMLDivElement>,
    rings: Map<number, SVGPolygonElement>,
  ) => void;
  configure: (next: Config) => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  grab: (x: number, y: number) => void;
  pull: (x: number, y: number) => void;
  fling: (vx: number, vy: number) => void;
  lift: (floe: number | null) => void;
  focus: (floe: number | null, show: boolean) => void;
  nearest: (dx: number, dy: number, from: number | null) => number | null;
  nearestItem: (item: number) => number | null;
  dispose: () => void;
};

function createEngine(
  stage: HTMLDivElement,
  water: HTMLDivElement,
  ripple: HTMLDivElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let layout: Layout | null = null;
  let view: View | null = null;
  let nodes = new Map<number, HTMLDivElement>();
  let rings = new Map<number, SVGPolygonElement>();
  let frame = 0;
  let last = 0;
  let disposed = false;
  let n = 0;
  // Floes, in water coordinates.
  let px = new Float64Array(0);
  let py = new Float64Array(0);
  let vx = new Float64Array(0);
  let vy = new Float64Array(0);
  let ang = new Float64Array(0);
  let angV = new Float64Array(0);
  let rad = new Float64Array(0);
  let phase = new Float64Array(0);
  let rise = new Float64Array(0);
  let sx = new Float64Array(0);
  let sy = new Float64Array(0);
  let shown = new Uint8Array(0);
  // The camera over the water, and how it is moving.
  const cam = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    mx: 0,
    my: 0,
    target: false,
    tx: 0,
    ty: 0,
  };
  let dragging = false;
  let grabbed: [number, number] = [0, 0];
  let camAtGrab: [number, number] = [0, 0];
  const tracker = createVelocityTracker();
  let time = 0;
  // Advanced only while the loop runs, so the field surfaces when seen.
  let surfacing = 0;
  // The lift: which floe, and its spring (0 in the water, 1 presented).
  let lifted: number | null = null;
  let held: number | null = null;
  const lift = { x: 0, v: 0, target: 0 };
  const ring = { t: 1, x: 0, y: 0, r: 40 };
  let focused: number | null = null;
  let focusShown = false;

  const place = () => {
    const L = layout;
    const v = view;
    if (!L || !v) return;
    const rand = mulberry(L.floes.length * 31 + 5);
    n = L.floes.length;
    px = new Float64Array(n);
    py = new Float64Array(n);
    vx = new Float64Array(n);
    vy = new Float64Array(n);
    ang = new Float64Array(n);
    angV = new Float64Array(n);
    rad = new Float64Array(n);
    phase = new Float64Array(n);
    rise = new Float64Array(n);
    sx = new Float64Array(n);
    sy = new Float64Array(n);
    shown = new Uint8Array(n);
    // Dart throwing: each floe tries a few places clear of the others.
    for (let i = 0; i < n; i += 1) {
      const f = L.floes[i];
      if (!f) continue;
      rad[i] = f.r;
      ang[i] = f.turn * 6;
      phase[i] = rand() * Math.PI * 2;
      let bx = 0;
      let by = 0;
      let best = -1;
      for (let tries = 0; tries < 30; tries += 1) {
        const x = (rand() - 0.5) * v.tileX;
        const y = v.yTop + rand() * v.tileY;
        let clear = Infinity;
        for (let j = 0; j < i; j += 1) {
          const dx = wrap(x - (px[j] ?? 0), -v.tileX / 2, v.tileX);
          const dy = wrap(y - (py[j] ?? 0), -v.tileY / 2, v.tileY);
          clear = Math.min(clear, Math.hypot(dx, dy) - (rad[j] ?? 0) - f.r);
        }
        if (clear > best) {
          best = clear;
          bx = x;
          by = y;
        }
        if (clear > f.r * 0.35) break;
      }
      px[i] = bx;
      py[i] = by;
    }
  };

  /** Writes every floe's place and the water's. */
  const paint = () => {
    const L = layout;
    const v = view;
    const c = cfg;
    if (!L || !v || !c) return;
    const S = smooth(0, 1, Math.max(0, lift.x));
    for (let i = 0; i < n; i += 1) {
      const node = nodes.get(i);
      if (!node) continue;
      const x = wrap((px[i] ?? 0) - cam.x, -v.tileX / 2, v.tileX);
      const y = wrap((py[i] ?? 0) - cam.y, v.yTop, v.tileY);
      const r = rad[i] ?? 40;
      const [X, Y, s] = screenOf(v, x, y);
      sx[i] = X;
      sy[i] = Y;
      const onScreen =
        X + r * s > -20 &&
        X - r * s < v.w + 20 &&
        Y + r * s > -20 &&
        Y - r * s < v.h + 20;
      shown[i] = onScreen ? 1 : 0;
      if (!onScreen && i !== lifted) {
        if (node.style.visibility !== "hidden")
          node.style.visibility = "hidden";
        continue;
      }
      if (node.style.visibility) node.style.visibility = "";
      const up = clamp(rise[i] ?? 0, 0, 1);
      const far = smooth(v.yFar - 10, v.yFar + (v.yNear - v.yFar) * 0.32, y);
      const bob =
        c.motionSafe && !c.paused ? Math.sin(time * 1.3 + (phase[i] ?? 0)) : 0;
      let tx = x;
      let ty = y;
      let tz = -18 * (1 - up) + 1.6 * bob;
      let rz = ang[i] ?? 0;
      let rx = 1.2 * bob;
      let sc = 1;
      if (i === lifted) {
        // Presented: up out of the water, turned to face you, larger.
        const [cx, cy] = planeAt(v, v.w / 2, v.h * 0.47);
        const k = lift.x;
        const grow = clamp((0.42 * Math.min(v.w, v.h)) / (2 * r), 1, 2.4);
        tx = x + (cx - x) * S;
        ty = y + (cy - y) * S;
        tz = tz + k * 70;
        rz = rz * (1 - S);
        rx = rx - v.tilt * 0.82 * S;
        sc = 1 + (grow - 1) * S;
      }
      const opacity = r2(
        up *
          (i === lifted ? 1 : far) *
          (lifted !== null && i !== lifted ? 1 - 0.35 * S : 1),
      );
      node.style.transform = `translate3d(${r2(tx)}px, ${r2(ty)}px, ${r2(tz)}px) rotateZ(${r2(rz)}deg) rotateX(${r2(rx)}deg) scale(${r2(sc)})`;
      node.style.opacity = String(opacity);
      const ringNode = rings.get(i);
      if (ringNode) {
        const on = focusShown && focused === i ? "1" : "0";
        if (ringNode.style.opacity !== on) ringNode.style.opacity = on;
      }
    }
    // The water moves with the field, one glint tile at a time.
    const gx = wrap(-cam.x, -180, 180);
    const gy = wrap(-cam.y, -140, 140);
    water.style.transform = `translate3d(${r2(gx)}px, ${r2(gy)}px, -24px)`;
    if (ring.t < 1) {
      const k = ring.t;
      const x = wrap(ring.x - cam.x, -v.tileX / 2, v.tileX);
      const y = wrap(ring.y - cam.y, v.yTop, v.tileY);
      ripple.style.width = `${Math.round(ring.r * 2)}px`;
      ripple.style.height = `${Math.round(ring.r * 2)}px`;
      ripple.style.transform = `translate3d(${r2(x - ring.r)}px, ${r2(y - ring.r)}px, -16px) scale(${r2(0.7 + 1.1 * k)})`;
      ripple.style.opacity = String(r2(0.55 * (1 - k)));
    } else if (ripple.style.opacity !== "0") ripple.style.opacity = "0";
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    const v = view;
    if (!c || !v) return false;
    let moving = false;
    const live = c.motionSafe && !c.paused;
    if (live) time += dt;

    // The camera: the hand, a throw gliding out, the current, a key's glide.
    const beforeX = cam.x;
    const beforeY = cam.y;
    if (!dragging) {
      if (cam.target) {
        const D = springs.drift;
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          cam.vx +=
            ((-D.stiffness * (cam.x - cam.tx) - D.damping * cam.vx) / D.mass) *
            h;
          cam.vy +=
            ((-D.stiffness * (cam.y - cam.ty) - D.damping * cam.vy) / D.mass) *
            h;
          cam.x += cam.vx * h;
          cam.y += cam.vy * h;
        }
        if (
          Math.hypot(cam.x - cam.tx, cam.y - cam.ty) < 0.3 &&
          Math.hypot(cam.vx, cam.vy) < 2
        ) {
          cam.target = false;
          cam.vx = 0;
          cam.vy = 0;
        }
        moving = true;
      } else {
        const tau = 1.4 - 1.1 * clamp(c.friction, 0, 1);
        const keep = c.motionSafe ? Math.exp(-dt / tau) : 0;
        cam.vx *= keep;
        cam.vy *= keep;
        if (Math.hypot(cam.vx, cam.vy) < 1) {
          cam.vx = 0;
          cam.vy = 0;
        } else moving = true;
        cam.x += cam.vx * dt;
        cam.y += cam.vy * dt;
      }
      if (live && lifted === null && c.drift > 0) {
        const a = (c.heading * Math.PI) / 180;
        const speed = clamp(c.drift, 0, 1) * 30;
        // The floes travel along the heading: the camera goes the other way.
        cam.x -= Math.sin(a) * speed * dt;
        cam.y += Math.cos(a) * speed * dt;
        if (cam.target) {
          cam.tx -= Math.sin(a) * speed * dt;
          cam.ty += Math.cos(a) * speed * dt;
        }
        moving = true;
      }
    } else moving = true;

    // How the camera accelerated: the floes feel it as a lag.
    const mx = dt > 0 ? (cam.x - beforeX) / dt : 0;
    const my = dt > 0 ? (cam.y - beforeY) / dt : 0;
    const ax = dt > 0 ? (mx - cam.mx) / dt : 0;
    const ay = dt > 0 ? (my - cam.my) / dt : 0;
    cam.mx += (mx - cam.mx) * 0.5;
    cam.my += (my - cam.my) * 0.5;

    if (c.motionSafe && n > 0) {
      const jostle = clamp(c.jostle, 0, 1);
      const drag = 2.2;
      let restless = 0;
      for (let i = 0; i < n; i += 1) {
        if (i === lifted || i === held) {
          vx[i] = 0;
          vy[i] = 0;
          continue;
        }
        const r = rad[i] ?? 40;
        const lag = jostle * (0.25 + 0.5 * (r / 90));
        const wander = live ? 5 : 0;
        const wx = wander * Math.sin(time * 0.13 + (phase[i] ?? 0));
        const wy = wander * Math.cos(time * 0.11 + (phase[i] ?? 0) * 1.7);
        const fx = drag * (wx - (vx[i] ?? 0)) + clamp(ax, -4000, 4000) * lag;
        const fy = drag * (wy - (vy[i] ?? 0)) + clamp(ay, -4000, 4000) * lag;
        vx[i] = (vx[i] ?? 0) + fx * dt;
        vy[i] = (vy[i] ?? 0) + fy * dt;
        angV[i] = (angV[i] ?? 0) * Math.exp(-dt * 1.6);
      }
      // Collisions: pushed apart, a little bounce, and the slip turns them.
      for (let i = 0; i < n; i += 1) {
        if (i === lifted) continue;
        for (let j = i + 1; j < n; j += 1) {
          if (j === lifted) continue;
          const dx = wrap((px[j] ?? 0) - (px[i] ?? 0), -v.tileX / 2, v.tileX);
          const dy = wrap((py[j] ?? 0) - (py[i] ?? 0), -v.tileY / 2, v.tileY);
          const reach = ((rad[i] ?? 0) + (rad[j] ?? 0)) * 0.9;
          const d2 = dx * dx + dy * dy;
          if (d2 >= reach * reach || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const mi = (rad[i] ?? 1) ** 2;
          const mj = (rad[j] ?? 1) ** 2;
          const overlap = reach - d;
          const share = Math.min(1, dt * 6);
          const hold = i === held ? 0 : mj / (mi + mj);
          const give = j === held ? 0 : mi / (mi + mj);
          px[i] = (px[i] ?? 0) - nx * overlap * hold * share;
          py[i] = (py[i] ?? 0) - ny * overlap * hold * share;
          px[j] = (px[j] ?? 0) + nx * overlap * give * share;
          py[j] = (py[j] ?? 0) + ny * overlap * give * share;
          const rvx = (vx[j] ?? 0) - (vx[i] ?? 0);
          const rvy = (vy[j] ?? 0) - (vy[i] ?? 0);
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const J = (-(1 + 0.25) * vn) / (1 / mi + 1 / mj);
            vx[i] = (vx[i] ?? 0) - (J / mi) * nx;
            vy[i] = (vy[i] ?? 0) - (J / mi) * ny;
            vx[j] = (vx[j] ?? 0) + (J / mj) * nx;
            vy[j] = (vy[j] ?? 0) + (J / mj) * ny;
            const vt = -rvx * ny + rvy * nx;
            const spin = 0.9 * jostle;
            angV[i] =
              (angV[i] ?? 0) + ((vt * spin * 57.3) / (rad[i] ?? 40)) * 0.5;
            angV[j] =
              (angV[j] ?? 0) - ((vt * spin * 57.3) / (rad[j] ?? 40)) * 0.5;
          }
        }
      }
      for (let i = 0; i < n; i += 1) {
        if (i === lifted) continue;
        px[i] = (px[i] ?? 0) + (vx[i] ?? 0) * dt;
        py[i] = (py[i] ?? 0) + (vy[i] ?? 0) * dt;
        ang[i] = (ang[i] ?? 0) + (angV[i] ?? 0) * dt;
        restless = Math.max(
          restless,
          Math.abs(vx[i] ?? 0) + Math.abs(vy[i] ?? 0),
          Math.abs(angV[i] ?? 0),
        );
      }
      if (restless > 0.6) moving = true;
    }

    // Surfacing: near floes first, a cascade inside about half a second.
    if (surfacing < 1) {
      surfacing = Math.min(1, surfacing + dt / 0.9);
      for (let i = 0; i < n; i += 1) {
        const depth = clamp(((sy[i] ?? 0) / Math.max(1, v.h)) * -1 + 1, 0, 1);
        rise[i] = smooth(depth * 0.45, depth * 0.45 + 0.5, surfacing);
      }
      moving = true;
    }

    // The lifted floe's spring: glide up, recoil back into the water.
    const k = lift.target > lift.x ? springs.glide : springs.recoil;
    if (lifted !== null) {
      if (c.motionSafe) {
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          lift.v +=
            ((-k.stiffness * (lift.x - lift.target) - k.damping * lift.v) /
              k.mass) *
            h;
          lift.x += lift.v * h;
        }
      } else {
        lift.x = lift.target;
        lift.v = 0;
      }
      if (Math.abs(lift.x - lift.target) < 0.0008 && Math.abs(lift.v) < 0.004) {
        lift.x = lift.target;
        lift.v = 0;
        if (lift.target === 0) lifted = null;
      } else moving = true;
    }
    if (ring.t < 1) {
      ring.t = Math.min(1, ring.t + dt / 1.1);
      moving = true;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !layout) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    paint();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  return {
    setLayout(next, nextNodes, nextRings) {
      const sameSize =
        layout &&
        layout.floes.length === next.floes.length &&
        layout.w === next.w &&
        layout.h === next.h;
      layout = next;
      nodes = nextNodes;
      rings = nextRings;
      view = viewOf(next.w, next.h, cfg?.tilt ?? 50, next.rBar);
      if (!sameSize) {
        const first = n === 0;
        place();
        lifted = null;
        held = null;
        lift.x = 0;
        lift.v = 0;
        lift.target = 0;
        // The first field surfaces when it is seen; a re-laid one is just there.
        if (!first || !cfg?.motionSafe) {
          surfacing = 1;
          rise.fill(1);
        }
      }
      step(0);
      paint();
      kick();
    },
    configure(next) {
      const was = cfg;
      cfg = next;
      if (layout && (!was || was.tilt !== next.tilt)) {
        view = viewOf(layout.w, layout.h, next.tilt, layout.rBar);
      }
      if (!next.motionSafe) {
        surfacing = 1;
        rise.fill(1);
      }
      paint();
      kick();
    },
    seen(inView) {
      if (inView) {
        paint();
        kick();
      }
    },
    wake() {
      paint();
      kick();
    },
    grab(x, y) {
      const v = view;
      if (!v) return;
      dragging = true;
      cam.target = false;
      grabbed = planeAt(v, x, y);
      camAtGrab = [cam.x, cam.y];
      tracker.reset();
      tracker.push(cam.x, cam.y, performance.now());
      kick();
    },
    pull(x, y) {
      const v = view;
      if (!v || !dragging) return;
      const [gx, gy] = planeAt(v, x, y);
      // The water under the finger stays under the finger.
      cam.x = camAtGrab[0] - (gx - grabbed[0]);
      cam.y = camAtGrab[1] - (gy - grabbed[1]);
      tracker.push(cam.x, cam.y, performance.now());
      if (!cfg?.motionSafe) paint();
      kick();
    },
    fling() {
      if (!dragging) return;
      dragging = false;
      const vel = tracker.velocity();
      if (cfg?.motionSafe) {
        cam.vx = clamp(vel.x, -2400, 2400);
        cam.vy = clamp(vel.y, -2400, 2400);
      }
      kick();
    },
    lift(floe) {
      const c = cfg;
      if (!c) return;
      if (floe === null) {
        if (lifted !== null) {
          lift.target = 0;
          held = null;
          if (!c.motionSafe) lifted = null;
        }
      } else {
        if (lifted !== null && lifted !== floe) {
          // Another floe is up: it drops back at once.
          lifted = null;
          lift.x = 0;
          lift.v = 0;
        }
        lifted = floe;
        held = floe;
        lift.target = 1;
        const v = view;
        if (v) {
          ring.t = c.motionSafe ? 0 : 1;
          ring.x = px[floe] ?? 0;
          ring.y = py[floe] ?? 0;
          ring.r = (rad[floe] ?? 40) * 1.1;
        }
      }
      paint();
      kick();
    },
    focus(floe, show) {
      focused = floe;
      focusShown = show;
      const v = view;
      if (floe !== null && v) {
        // Keep the focused floe well inside the view: glide there on drift.
        const X = sx[floe] ?? v.w / 2;
        const Y = sy[floe] ?? v.h / 2;
        const inside =
          X > v.w * 0.18 && X < v.w * 0.82 && Y > v.h * 0.3 && Y < v.h * 0.85;
        if (!inside) {
          const [ax, ay] = planeAt(v, X, Y);
          const [bx, by] = planeAt(v, v.w / 2, v.h * 0.62);
          cam.tx = cam.x + (ax - bx);
          cam.ty = cam.y + (ay - by);
          if (cfg?.motionSafe) cam.target = true;
          else {
            cam.x = cam.tx;
            cam.y = cam.ty;
          }
        }
      }
      paint();
      kick();
    },
    nearest(dx, dy, from) {
      const v = view;
      if (!v || n === 0) return null;
      const cx = from !== null ? (sx[from] ?? v.w / 2) : v.w / 2;
      const cy = from !== null ? (sy[from] ?? v.h / 2) : v.h * 0.62;
      let best: number | null = null;
      let score = Infinity;
      for (let i = 0; i < n; i += 1) {
        if (i === from || !shown[i]) continue;
        const ex = (sx[i] ?? 0) - cx;
        const ey = (sy[i] ?? 0) - cy;
        if (dx === 0 && dy === 0) {
          const d = Math.hypot(ex, ey);
          if (d < score) {
            score = d;
            best = i;
          }
          continue;
        }
        const along = ex * dx + ey * dy;
        const across = Math.abs(ex * dy - ey * dx);
        if (along < 8 || across > along * 1.3) continue;
        const s = along + across * 2;
        if (s < score) {
          score = s;
          best = i;
        }
      }
      return best;
    },
    nearestItem(item) {
      const v = view;
      const L = layout;
      if (!v || !L) return null;
      let best: number | null = null;
      let score = Infinity;
      for (let i = 0; i < n; i += 1) {
        if (L.floes[i]?.item !== item) continue;
        const d =
          Math.hypot((sx[i] ?? 0) - v.w / 2, (sy[i] ?? 0) - v.h * 0.62) +
          (shown[i] ? 0 : 5000);
        if (d < score) {
          score = d;
          best = i;
        }
      }
      return best;
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * An endless field of ice floes drifting on dark water, seen in CSS 3D from
 * above at an angle, each floe carrying a picture on its snowy face: a seeded
 * irregular slab with a cyan body under the water, a wet rim, a thickness
 * that shows on its near side and a print laid on the snow. The current
 * carries the field along its heading while each floe bobs on its own.
 *
 * Drag to glide over the water: the point under the finger stays under the
 * finger, and a throw glides out with friction. The floes have inertia in the
 * water — they lag when it moves, bump into each other as circles, and the
 * slip of each bump turns them — so a fling sets the field jostling. The
 * first time it is seen the floes surface, near ones first. Click a floe (or
 * press Enter on the focused one) and it rises out of the water on the glide
 * spring, turns to face you and comes forward with its caption, leaving a ring
 * on the water; lowered, it drops back and lands on the recoil spring with two
 * bobs. Arrow keys move between floes on screen, Home and End go to the first
 * and last pictures, Escape lowers. Under reduced motion the water lies still
 * and the lift is a quiet change of focus.
 */
export function IceFloes({
  items = defaultIceItems,
  value,
  defaultValue = null,
  onValueChange,
  density = 0.6,
  drift = 0.35,
  tint = 215,
  heading = 200,
  tilt = 50,
  size = 1,
  jostle = 0.5,
  friction = 0.5,
  label = "Ice floes",
  paused = false,
  disabled = false,
  seed = 7,
  className,
}: IceFloesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const count = Math.max(1, items.length);
  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const liftedItem = value !== undefined ? value : own;
  const [layout, setLayout] = React.useState<Layout | null>(null);
  const [focusFloe, setFocusFloe] = React.useState<number | null>(null);
  const [keyboard, setKeyboard] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const waterRef = React.useRef<HTMLDivElement | null>(null);
  const rippleRef = React.useRef<HTMLDivElement | null>(null);
  const floeRefs = React.useRef(new Map<number, HTMLDivElement>());
  const ringRefs = React.useRef(new Map<number, SVGPolygonElement>());
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const liftedFloe = React.useRef<number | null>(null);
  const wantFloe = React.useRef<number | null>(null);
  // Keyboard focus that arrived before the first layout picks a floe on it.
  const pendingPick = React.useRef(false);

  const view = layout ? viewOf(layout.w, layout.h, tilt, layout.rBar) : null;
  const pond = view
    ? {
        left: Math.round(-view.tileX / 2 - 240),
        top: Math.round(view.yTop - 240),
        width: Math.round(view.tileX + 480),
        height: Math.round(view.tileY + 480),
      }
    : { left: -1800, top: -2400, width: 3600, height: 3200 };
  const water = {
    deep: `oklch(0.17 0.035 ${tint})`,
    mid: `oklch(0.24 0.045 ${tint})`,
    glint: `oklch(0.62 0.05 ${tint} / 0.22)`,
    mist: `oklch(0.3 0.03 ${tint})`,
    under: `oklch(0.62 0.09 ${(tint + 345) % 360} / 0.55)`,
  };

  const config: Config = {
    drift,
    heading,
    tilt,
    jostle,
    friction,
    paused,
    disabled,
    motionSafe,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const waterNode = waterRef.current;
    const ripple = rippleRef.current;
    if (!root || !waterNode || !ripple) return;
    const e = createEngine(root, waterNode, ripple, visible);
    engine.current = e;
    e.configure(latest.current);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        e.seen(visible.current);
      },
      { threshold: 0.15 },
    );
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher.disconnect();
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // The field is laid out for the box it is in, and again when that changes.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const w = Math.round(root.clientWidth);
      const h = Math.round(root.clientHeight);
      if (w < 1 || h < 1) return;
      setLayout(buildLayout(w, h, seed, density, size, tilt, count));
    };
    // The observer reports the first size itself.
    const sizer = new ResizeObserver(measure);
    sizer.observe(root);
    return () => sizer.disconnect();
  }, [seed, density, size, tilt, count]);

  // Hand the engine the new floes once their nodes exist.
  React.useLayoutEffect(() => {
    if (!layout) return;
    const e = engine.current;
    e?.setLayout(layout, floeRefs.current, ringRefs.current);
    liftedFloe.current = null;
    if (pendingPick.current && e) {
      pendingPick.current = false;
      const floe = e.nearest(0, 0, null);
      if (floe !== null) {
        e.focus(floe, true);
        // The pick is state; it lands after this commit, not inside it.
        queueMicrotask(() => setFocusFloe(floe));
      }
    }
  }, [layout]);

  // A lifted item (from a click, a key or the host) raises its nearest floe.
  React.useEffect(() => {
    const e = engine.current;
    if (!e || !layout) return;
    if (liftedItem === null) {
      if (liftedFloe.current !== null) e.lift(null);
      liftedFloe.current = null;
      return;
    }
    const current = liftedFloe.current;
    if (current !== null && layout.floes[current]?.item === liftedItem) return;
    // The floe the visitor pointed at, or the nearest one showing the item.
    const wanted = wantFloe.current;
    const floe =
      wanted !== null && layout.floes[wanted]?.item === liftedItem
        ? wanted
        : e.nearestItem(liftedItem);
    wantFloe.current = null;
    liftedFloe.current = floe;
    e.lift(floe);
  }, [liftedItem, layout]);

  const choose = (item: number | null, floe: number | null) => {
    if (disabled) return;
    if (item === liftedItem) {
      // Another floe with the same picture: it takes the lifted one's place.
      if (item !== null && floe !== null && floe !== liftedFloe.current) {
        liftedFloe.current = floe;
        engine.current?.lift(floe);
      }
      return;
    }
    // The lift itself follows the value, so a host that refuses it never
    // shows a floe that is not really up.
    wantFloe.current = floe;
    if (value === undefined) setOwn(item);
    onValueChange?.(item);
    const it = item !== null ? items[item] : undefined;
    setSaid((s) => ({
      n: s.n + 1,
      text: it
        ? `Lifted: ${it.caption ?? it.alt}${it.note ? `. ${it.note}` : ""}.`
        : "Lowered into the water.",
    }));
  };

  const local = (x: number, y: number): [number, number] => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? [x - rect.left, y - rect.top] : [0, 0];
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point, offset }) => {
      const [x, y] = local(point.x - offset.x, point.y - offset.y);
      engine.current?.grab(x, y);
      const [x2, y2] = local(point.x, point.y);
      engine.current?.pull(x2, y2);
    },
    onMove: ({ point }) => {
      const [x, y] = local(point.x, point.y);
      engine.current?.pull(x, y);
    },
    onEnd: () => engine.current?.fling(0, 0),
    onCancel: () => engine.current?.fling(0, 0),
    onTap: (event) => {
      const target = event.target;
      const node =
        target instanceof Element ? target.closest("[data-floe]") : null;
      const floe = node ? Number(node.getAttribute("data-floe")) : null;
      if (floe === null || Number.isNaN(floe) || !layout) {
        choose(null, null);
        return;
      }
      const item = layout.floes[floe]?.item ?? null;
      if (keyboard) setFocusFloe(floe);
      if (liftedFloe.current === floe) choose(null, null);
      else choose(item, floe);
    },
  });

  const focusOn = (floe: number | null) => {
    setFocusFloe(floe);
    engine.current?.focus(floe, true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const e = engine.current;
    if (disabled || !e || !layout) return;
    setKeyboard(true);
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[event.key];
    if (dir) {
      event.preventDefault();
      const next =
        e.nearest(dir[0], dir[1], focusFloe) ??
        (focusFloe === null ? e.nearest(0, 0, null) : null);
      if (next !== null) focusOn(next);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const floe = e.nearestItem(event.key === "Home" ? 0 : count - 1);
      if (floe !== null) focusOn(floe);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      const floe = focusFloe ?? e.nearest(0, 0, null);
      if (floe === null) return;
      if (focusFloe === null) focusOn(floe);
      if (liftedFloe.current === floe) choose(null, null);
      else choose(layout.floes[floe]?.item ?? null, floe);
      return;
    }
    if (event.key === "Escape" && liftedItem !== null) {
      event.preventDefault();
      choose(null, null);
    }
  };

  const activeItem =
    focusFloe !== null && layout
      ? (layout.floes[focusFloe]?.item ?? null)
      : null;
  const optionId = (i: number) => `${uid}-item-${i}`;
  const shownItem = liftedItem !== null ? items[liftedItem] : undefined;

  return (
    <div
      ref={rootRef}
      role="listbox"
      aria-label={label}
      aria-roledescription="ice field"
      aria-describedby={`${uid}-hint`}
      aria-activedescendant={
        activeItem !== null ? optionId(activeItem) : undefined
      }
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        const kb = event.currentTarget.matches(":focus-visible");
        setKeyboard(kb);
        if (kb && focusFloe === null) {
          const floe = layout
            ? (engine.current?.nearest(0, 0, null) ?? null)
            : null;
          if (floe !== null) focusOn(floe);
          else pendingPick.current = true;
        } else engine.current?.focus(focusFloe, kb);
      }}
      onBlur={() => {
        pendingPick.current = false;
        setKeyboard(false);
        engine.current?.focus(focusFloe, false);
      }}
      {...drag}
      onPointerDown={(event) => {
        setKeyboard(false);
        engine.current?.focus(focusFloe, false);
        drag.onPointerDown(event);
      }}
      className={cn(
        "group/ice-floes @container relative isolate touch-none overflow-clip select-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{
        backgroundColor: water.deep,
        backgroundImage: `linear-gradient(180deg, ${water.mist} 0%, ${water.mid} 34%, ${water.deep} 100%)`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          perspective: layout ? `${Math.round(layout.h * 1.7)}px` : "1000px",
          perspectiveOrigin: layout
            ? `50% ${Math.round(layout.h * 0.6)}px`
            : "50% 60%",
        }}
      >
        <div
          className="absolute left-1/2 [transform-style:preserve-3d]"
          style={{
            top: layout ? Math.round(layout.h * 0.6) : "60%",
            transform: `rotateX(${r2(clamp(tilt, 35, 62))}deg)`,
          }}
        >
          <div
            ref={waterRef}
            className="absolute"
            style={{
              ...pond,
              backgroundImage: [
                `radial-gradient(ellipse 34px 5px at 40px 30px, ${water.glint}, transparent)`,
                `radial-gradient(ellipse 22px 4px at 130px 90px, ${water.glint}, transparent)`,
                `radial-gradient(ellipse 28px 4px at 90px 120px, oklch(0.7 0.04 ${tint} / 0.12), transparent)`,
              ].join(", "),
              backgroundSize: "180px 140px",
            }}
          />
          <div
            ref={rippleRef}
            className="absolute top-0 left-0 rounded-full border-2 opacity-0"
            style={{ borderColor: `oklch(0.85 0.04 ${tint} / 0.8)` }}
          />
          {layout?.floes.map((f) => {
            const item = items[f.item];
            return (
              <div
                key={f.id}
                data-floe={f.id}
                ref={(node) => {
                  if (node) floeRefs.current.set(f.id, node);
                  else floeRefs.current.delete(f.id);
                }}
                className="absolute [transform-style:preserve-3d]"
                style={{
                  left: -f.r,
                  top: -f.r,
                  width: f.r * 2,
                  height: f.r * 2,
                  opacity: 0,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: f.shape,
                    backgroundColor: "oklch(0.08 0.02 250 / 0.55)",
                    transform: "translate3d(5px, 7px, -16px) scale(1.06)",
                    filter: "blur(5px)",
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: f.shape,
                    backgroundColor: water.under,
                    transform: "translateZ(-9px) scale(1.07)",
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: f.shape,
                    backgroundImage:
                      "linear-gradient(180deg, oklch(0.8 0.05 225), oklch(0.62 0.07 230))",
                    transform: "translateZ(-5px)",
                  }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: f.shape,
                    backgroundImage:
                      "linear-gradient(160deg, oklch(0.97 0.012 230), oklch(0.86 0.03 225))",
                  }}
                >
                  <div
                    className="absolute inset-[7%]"
                    style={{
                      clipPath: f.shape,
                      backgroundColor: "oklch(0.985 0.006 240)",
                      backgroundImage:
                        "radial-gradient(circle at 30% 28%, oklch(1 0 0), transparent 55%), radial-gradient(circle at 72% 70%, oklch(0.9 0.02 230), transparent 60%)",
                    }}
                  />
                </div>
                <div
                  className="absolute top-1/2 left-1/2 aspect-[4/3] w-[56%] overflow-hidden rounded-[3px] bg-white p-[3%] shadow-[0_2px_4px_oklch(0_0_0/0.25)]"
                  style={{
                    transform: `translate(-50%, -50%) rotate(${f.turn}deg)`,
                  }}
                >
                  <div className="size-full overflow-hidden rounded-[2px]">
                    {item?.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.src}
                        alt=""
                        draggable={false}
                        className="block size-full object-cover"
                      />
                    ) : (
                      <Postcard index={f.item} />
                    )}
                  </div>
                </div>
                <svg
                  className="pointer-events-none absolute inset-0 size-full overflow-visible"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  <polygon
                    ref={(node) => {
                      if (node) ringRefs.current.set(f.id, node);
                      else ringRefs.current.delete(f.id);
                    }}
                    points={f.points}
                    fill="none"
                    stroke="var(--ring)"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                    style={{ opacity: 0 }}
                  />
                </svg>
              </div>
            );
          })}
        </div>
      </div>
      {/* Sea mist over the distance, and a darker foreground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(180deg, ${water.mist} 0%, color-mix(in oklab, ${water.mist} 70%, transparent) 14%, transparent 46%, transparent 78%, oklch(0 0 0 / 0.22) 100%)`,
        }}
      />
      <AnimatePresence initial={false}>
        {shownItem ? (
          <motion.div
            key={liftedItem}
            aria-hidden
            className="pointer-events-none absolute right-3 bottom-3 left-3 flex justify-start @[30rem]:right-auto @[30rem]:max-w-80"
            initial={
              motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            <div className="rounded-3 border border-white/15 bg-black/55 px-3 py-2 text-white backdrop-blur-sm">
              <p className="text-sm leading-snug font-medium">
                {shownItem.caption ?? shownItem.alt}
              </p>
              {shownItem.note ? (
                <p className="mt-0.5 font-mono text-[10px] tracking-[0.06em] text-white/70 uppercase">
                  {shownItem.note}
                </p>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-3 left-3 rounded-2 bg-black/45 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-white/75 uppercase backdrop-blur-sm transition-opacity duration-300",
          shownItem && "opacity-0",
        )}
      >
        Drag to glide · click a floe
      </p>
      <div className="sr-only">
        {items.map((item, i) => (
          <div
            key={`${i}:${item.alt}`}
            id={optionId(i)}
            role="option"
            aria-selected={liftedItem === i}
          >
            {`${item.caption ?? item.alt}. ${item.alt}${item.note ? `, ${item.note}` : ""}`}
          </div>
        ))}
      </div>
      <span id={`${uid}-hint`} className="sr-only">
        Drag to glide over the water. Arrow keys move between floes, Home and
        End go to the first and last pictures, Enter lifts a floe to read it,
        Escape lowers it.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
