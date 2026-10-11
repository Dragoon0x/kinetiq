"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type CondenserCoilProps = {
  /** How fast the liquid runs, 0 (a slow seep) to 1 (a brisk run); a sent slug runs faster with it too. @default 0.4 */
  flow?: number;
  /** How many small bubbles ride in the slugs, 0 to 40. @default 14 */
  bubbles?: number;
  /** The liquid light's hue, 0 to 360, held at a fixed lightness for each theme. @default 205 */
  hue?: number;
  /** The coil as an SVG path; it is fitted inside the box with its aspect kept. @default a horizontal coil that fits the box */
  path?: string;
  /** The coordinate box `path` was drawn in, so the server can show it before the canvas paints. */
  viewBox?: string;
  /** Loops in the generated coil, 2 to 16. @default about one for every 64 px of width */
  turns?: number;
  /** The tube's outer width, in px, 6 to 18. @default 10 */
  tubeWidth?: number;
  /** How much brighter the light runs where the coil doubles back on itself, 0 to 1. @default 0.6 */
  glow?: number;
  /** How strongly the pointer warms the glass: the flow it adds and the bubbles it raises, 0 to 1. @default 0.6 */
  warmth?: number;
  /** The colour warm glass takes on, any CSS colour. @default "oklch(0.76 0.14 55)" */
  warmColor?: string;
  /** The glass's colour, any CSS colour; resolved on the element so it follows the theme. @default "var(--foreground)" */
  glassColor?: string;
  /** Content above the coil: a caption, a heading, a call to action. */
  children?: React.ReactNode;
  /** The pointer and keys warm the glass and send slugs. @default true */
  interactive?: boolean;
  /** Hold the liquid where it stands; a sent slug still runs. @default false */
  paused?: boolean;
  /** Names the coil for assistive technology. @default "Glass condenser coil" */
  label?: string;
  /** Seeds the slugs' lengths and where the bubbles ride. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a bright slug is sent, from the click or key that sent it. */
  onSend?: () => void;
  /** Fires when a bright slug leaves the outlet, with how many have run through. */
  onArrive?: (count: number) => void;
  /** Shows the coil flowing but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

/** Px of tube between samples of the centreline. */
const STEP = 2;
/** Bright slugs that can be in the coil at once. */
const SENT = 6;
/** Bubbles the warm glass can have raised and still carry. */
const NUCLEI = 36;
/** Slug stretches one pass of the coil can hold. */
const SPANS = 512;
const TAU = Math.PI * 2;
/** The light the glass catches comes from the upper left. */
const LIGHT_X = -0.45;
const LIGHT_Y = -0.89;
/** The nominal box the server's still is drawn in. */
const STILL_W = 720;
const STILL_H = 208;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small seeded generator: the same slugs for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (c: Rgb) =>
  0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2]);
const css = (c: Rgb) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

type Dense = { x: number[]; y: number[]; z: number[] };

/**
 * The generated coil: an inlet that curves up into a horizontal helix seen a
 * little from the side — each loop an open ellipse whose right half passes in
 * front and left half behind — and an outlet that curves back down. Both ends
 * join the helix at a loop's top, where its tangent runs straight ahead, so
 * the glass bends without a kink.
 */
function coilDense(
  w: number,
  h: number,
  tube: number,
  wanted: number | undefined,
): Dense {
  const pad = Math.max(10, tube * 1.8);
  const cy = h / 2;
  const a = clamp(h * 0.26, tube * 1.5, Math.max(tube * 1.5, h / 2 - pad));
  const stub = clamp(w * 0.07, 14, 56);
  const x0 = pad + stub;
  const x1 = Math.max(x0 + tube * 4, w - pad - stub);
  const turns = clamp(Math.round(wanted ?? (w - 64) / 64), 2, 16);
  const pitch = (x1 - x0) / turns;
  // Loops wider than the pitch overlap their neighbours, which is what makes
  // a coil read as a coil — and where the light doubles up.
  const b = Math.min(a * 0.62, pitch * 0.9);
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const cubic = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cyy: number,
    dx: number,
    dy: number,
    from: number,
  ) => {
    for (let i = from; i <= 28; i += 1) {
      const t = i / 28;
      const u = 1 - t;
      x.push(
        u * u * u * ax +
          3 * u * u * t * bx +
          3 * u * t * t * cx +
          t * t * t * dx,
      );
      y.push(
        u * u * u * ay +
          3 * u * u * t * by +
          3 * u * t * t * cyy +
          t * t * t * dy,
      );
      z.push(1);
    }
  };
  cubic(
    pad,
    cy,
    pad + stub * 0.55,
    cy,
    x0 - stub * 0.55,
    cy - a,
    x0,
    cy - a,
    0,
  );
  const steps = Math.ceil((turns * TAU * Math.max(a, b)) / 1.2);
  for (let i = 1; i <= steps; i += 1) {
    const t = (i / steps) * turns * TAU;
    x.push(x0 + (pitch * t) / TAU + b * Math.sin(t));
    y.push(cy - a * Math.cos(t));
    z.push(Math.sin(t));
  }
  cubic(
    x1,
    cy - a,
    x1 + stub * 0.55,
    cy - a,
    w - pad - stub * 0.55,
    cy,
    w - pad,
    cy,
    1,
  );
  return { x, y, z };
}

type Line = {
  n: number;
  len: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  closed: boolean;
};

/** The dense outline resampled every STEP px of arc, with its normals. */
function resample(d: Dense): Line | null {
  const m = d.x.length;
  if (m < 2) return null;
  const cum = new Float64Array(m);
  for (let i = 1; i < m; i += 1) {
    cum[i] =
      cum[i - 1]! + Math.hypot(d.x[i]! - d.x[i - 1]!, d.y[i]! - d.y[i - 1]!);
  }
  const total = cum[m - 1]!;
  if (total < STEP * 4) return null;
  const n = Math.floor(total / STEP) + 1;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    const at = i * STEP;
    while (j < m - 2 && cum[j + 1]! < at) j += 1;
    const span = cum[j + 1]! - cum[j]! || 1;
    const f = clamp01((at - cum[j]!) / span);
    x[i] = d.x[j]! + (d.x[j + 1]! - d.x[j]!) * f;
    y[i] = d.y[j]! + (d.y[j + 1]! - d.y[j]!) * f;
    z[i] = d.z[j]! + (d.z[j + 1]! - d.z[j]!) * f;
  }
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = x[b]! - x[a]!;
    const ty = y[b]! - y[a]!;
    const l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l;
    ny[i] = tx / l;
  }
  const closed = Math.hypot(x[0]! - x[n - 1]!, y[0]! - y[n - 1]!) < STEP * 2.5;
  return { n, len: (n - 1) * STEP, x, y, z, nx, ny, closed };
}

/**
 * How much other tubing lies within a bore of each point — where the coil
 * doubles back on itself, a front pass crossing a back one or two runs
 * lying close. Found once per shape through a spatial hash, then smoothed
 * along the tube so a crossing glows as one soft swell.
 */
function foldOf(line: Line, tube: number): Float32Array {
  const { n, x, y } = line;
  const cell = tube * 1.6;
  const reach2 = cell * cell;
  const sigma2 = 2 * (tube * 0.8) * (tube * 0.8);
  const skip = Math.ceil((tube * 3) / STEP);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    minX = Math.min(minX, x[i]!);
    minY = Math.min(minY, y[i]!);
    maxX = Math.max(maxX, x[i]!);
    maxY = Math.max(maxY, y[i]!);
  }
  const gx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const gy = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const cellOf = new Int32Array(n);
  const counts = new Int32Array(gx * gy + 1);
  for (let i = 0; i < n; i += 1) {
    const c =
      Math.floor((y[i]! - minY) / cell) * gx +
      Math.floor((x[i]! - minX) / cell);
    cellOf[i] = c;
    counts[c + 1] = counts[c + 1]! + 1;
  }
  for (let c = 1; c <= gx * gy; c += 1) counts[c] = counts[c]! + counts[c - 1]!;
  const start = counts.slice();
  const items = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = cellOf[i]!;
    items[start[c]!] = i;
    start[c] = start[c]! + 1;
  }
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const ci = Math.floor((x[i]! - minX) / cell);
    const cj = Math.floor((y[i]! - minY) / cell);
    let sum = 0;
    for (let dj = -1; dj <= 1; dj += 1) {
      const rj = cj + dj;
      if (rj < 0 || rj >= gy) continue;
      for (let di = -1; di <= 1; di += 1) {
        const ri = ci + di;
        if (ri < 0 || ri >= gx) continue;
        const c = rj * gx + ri;
        for (let q = counts[c]!; q < counts[c + 1]!; q += 1) {
          const j = items[q]!;
          if (Math.abs(j - i) <= skip) continue;
          const dx = x[j]! - x[i]!;
          const dy = y[j]! - y[i]!;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach2) sum += Math.exp(-d2 / sigma2);
        }
      }
    }
    raw[i] = 1 - Math.exp(-sum / 5);
  }
  const fold = new Float32Array(n);
  const r = 3;
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j += 1) {
      s += raw[j]!;
      c += 1;
    }
    fold[i] = s / c;
  }
  return fold;
}

type Run = { a: number; b: number; front: boolean };

/** Splits the line where it passes from in front of the coil to behind it. */
function runsOf(line: Line): Run[] {
  const runs: Run[] = [];
  let a = 0;
  let front = line.z[0]! >= 0;
  for (let i = 1; i < line.n; i += 1) {
    const f = line.z[i]! >= 0;
    if (f !== front) {
      runs.push({ a, b: i, front });
      a = i;
      front = f;
    }
  }
  runs.push({ a, b: line.n - 1, front });
  return runs;
}

type Train = {
  period: number;
  count: number;
  starts: Float32Array;
  ends: Float32Array;
  /** Where each of the 40 bubbles rides in the train, its size, sway and phase. */
  at: Float32Array;
  r: Float32Array;
  sway: Float32Array;
  phase: Float32Array;
};

/**
 * Segmented flow, laid out once: slugs of liquid of seeded lengths parted by
 * long gas gaps, one period at least as long as the run so the whole coil is
 * never a visible repeat. Each bubble is placed inside a slug and rides with
 * it, so bubbles are never left floating in a gap.
 */
function trainOf(len: number, tube: number, seed: number): Train {
  const rand = lcg(seed);
  const s: number[] = [];
  const e: number[] = [];
  let at = 0;
  const reach = Math.max(len, tube * 24);
  while ((at < reach || s.length < 2) && s.length < 600) {
    const slug = tube * (2.4 + 4.6 * rand());
    const gap = tube * (0.9 + 1.1 * rand());
    s.push(at);
    e.push(at + slug);
    at += slug + gap;
  }
  const count = s.length;
  const bubbleAt = new Float32Array(40);
  const bubbleR = new Float32Array(40);
  const sway = new Float32Array(40);
  const phase = new Float32Array(40);
  for (let q = 0; q < 40; q += 1) {
    const k = Math.min(count - 1, Math.floor(rand() * count));
    const from = s[k] ?? 0;
    const to = e[k] ?? from;
    bubbleAt[q] = from + (to - from) * (0.18 + 0.64 * rand());
    bubbleR[q] = tube * (0.12 + 0.13 * rand());
    sway[q] = 1.6 + 2.2 * rand();
    phase[q] = rand() * TAU;
  }
  return {
    period: at,
    count,
    starts: Float32Array.from(s),
    ends: Float32Array.from(e),
    at: bubbleAt,
    r: bubbleR,
    sway,
    phase,
  };
}

type Geo = Line & {
  w: number;
  h: number;
  dpr: number;
  tube: number;
  fold: Float32Array;
  runs: Run[];
  train: Train;
  back: HTMLCanvasElement | null;
  front: HTMLCanvasElement | null;
};

type Palette = {
  dark: boolean;
  glass: string;
  warm: string;
  body: string;
  core: string;
  bright: string;
  void: string;
  shine: string;
  glow: HTMLCanvasElement | null;
  ember: HTMLCanvasElement | null;
};

type Sim = {
  last: number;
  clock: number;
  /** How far the train has run, px, within one period. */
  phase: number;
  warm: number;
  warmTarget: number;
  /** Where along the run the glass is warmest, px. */
  warmAt: number;
  spawn: number;
  /** Time since the outlet's flare began, s; below zero when there is none. */
  flare: number;
  /** Reduced motion: the whole run lit at once, fading. */
  lit: number;
  arrived: number;
};

type Hand = {
  x: number;
  y: number;
  at: number;
  present: boolean;
  source: "pointer" | "key" | null;
};

type Api = {
  rebuild: () => void;
  repaint: () => void;
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
};

/** The props a coil must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button:not([data-coil]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true']";

/** The recoil spring's step response: the flare's bloom, two visible pulses. */
const RECOIL = (() => {
  const { stiffness, damping, mass } = springs.recoil;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return (t: number) =>
    1 -
    Math.exp(-zeta * w0 * t) *
      (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
})();

/**
 * A run of clear glass tubing coiled like a condenser, with liquid light
 * flowing through it: segmented flow, slugs of light parted by gas gaps, with
 * small bubbles swaying across the bore as they ride. Drawn in Canvas 2D: the
 * glass is cached in two layers (the passes behind the coil and the passes in
 * front), and only the liquid, its bubbles and the light are drawn each
 * frame. Where the coil doubles back on itself the light glows brighter — a
 * fold weight, found once per shape, says how much other tubing lies within a
 * bore of each point.
 *
 * The pointer warms the glass: a warm halo gathers on the tube nearest it,
 * the flow quickens and bubbles nucleate at the warm spot and ride out of the
 * outlet. A click sends one bright slug through the whole run: it launches with
 * a flick, flashes every crossing it passes, and leaves the outlet in a flare
 * that blooms with the recoil spring's overshoot. The keyboard's way in is a
 * transparent button behind the content: Enter or Space sends a slug, arrow
 * keys move a warm hand along the glass. Under reduced motion the train
 * stands still mid-run, warmth shows in place, and a send lights the whole run
 * at once and fades.
 */
export function CondenserCoil({
  flow = 0.4,
  bubbles = 14,
  hue = 205,
  path,
  viewBox,
  turns,
  tubeWidth = 10,
  glow = 0.6,
  warmth = 0.6,
  warmColor = "oklch(0.76 0.14 55)",
  glassColor = "var(--foreground)",
  children,
  interactive = true,
  paused = false,
  label = "Glass condenser coil",
  seed = 5,
  dpr = 2,
  onSend,
  onArrive,
  disabled = false,
  className,
}: CondenserCoilProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const tube = clamp(tubeWidth, 6, 18);
  const tint = ((Math.round(hue) % 360) + 360) % 360;
  const wantTurns =
    turns === undefined ? undefined : clamp(Math.round(turns), 2, 16);
  const k = {
    flow: clamp01(flow),
    bubbles: clamp(Math.round(bubbles), 0, 40),
    glow: clamp01(glow),
    warmth: clamp01(warmth),
    tint,
    tube,
    turns: wantTurns,
    path,
    seed,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const measureRef = React.useRef<SVGPathElement | null>(null);
  const geo = React.useRef<Geo | null>(null);
  const pal = React.useRef<Palette | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    clock: 0,
    phase: 0,
    warm: 0,
    warmTarget: 0,
    warmAt: 0,
    spawn: 0,
    flare: -1,
    lit: 0,
    arrived: 0,
  });
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    at: 0,
    present: false,
    source: null,
  });
  const sent = React.useRef({
    at: new Float32Array(SENT),
    v: new Float32Array(SENT),
    live: new Uint8Array(SENT),
  });
  const nuclei = React.useRef({
    at: new Float32Array(NUCLEI),
    r: new Float32Array(NUCLEI),
    phase: new Float32Array(NUCLEI),
    age: new Float32Array(NUCLEI),
    live: new Uint8Array(NUCLEI),
    next: 0,
    seq: 0,
  });
  const spans = React.useRef(new Float32Array(SPANS * 2));
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onSend, onArrive });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Any CSS colour the canvas understands, as sRGB bytes. */
  const rgbOf = (colour: string): Rgb => {
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return [128, 128, 128];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };

  /** A soft round glow in one colour, drawn once and stamped where needed. */
  const sprite = (c: Rgb): HTMLCanvasElement => {
    const s = document.createElement("canvas");
    s.width = 64;
    s.height = 64;
    const ctx = s.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.9)`);
      g.addColorStop(0.35, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.35)`);
      g.addColorStop(1, `rgb(${c[0]} ${c[1]} ${c[2]} / 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    return s;
  };

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    const colourOf = (i: number) => {
      const span = carriers.children[i];
      return span ? getComputedStyle(span).color : "rgb(128, 128, 128)";
    };
    const glass = rgbOf(colourOf(0));
    const warm = rgbOf(colourOf(1));
    const page = rgbOf(colourOf(2));
    // Light reads as light on a dark page; on a light page the liquid is
    // drawn deeper so it still carries, and glows by darkening, not adding.
    const dark = luminance(page) < 0.3;
    const L = dark ? [0.78, 0.92, 0.98] : [0.6, 0.76, 0.86];
    const C = dark ? [0.13, 0.07, 0.03] : [0.15, 0.12, 0.08];
    const body = rgbOf(`oklch(${L[0]} ${C[0]} ${k.tint})`);
    const core = rgbOf(`oklch(${L[1]} ${C[1]} ${k.tint})`);
    const bright = rgbOf(`oklch(${L[2]} ${C[2]} ${k.tint})`);
    pal.current = {
      dark,
      glass: css(glass),
      warm: css(warm),
      body: css(body),
      core: css(core),
      bright: css(bright),
      void: dark ? css(page) : "rgb(255 255 255)",
      shine: dark ? css(glass) : "rgb(255 255 255)",
      glow: sprite(dark ? bright : body),
      ember: sprite(warm),
    };
  };

  /** The glass that never changes, in two cached layers: behind and in front. */
  const paintGlass = () => {
    const g = geo.current;
    const p = pal.current;
    const canvas = canvasRef.current;
    if (!g || !p || !canvas) return;
    const layer = (front: boolean): HTMLCanvasElement | null => {
      if (!g.runs.some((r) => r.front === front)) return null;
      const c = (front ? g.front : g.back) ?? document.createElement("canvas");
      c.width = canvas.width;
      c.height = canvas.height;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
      ctx.clearRect(0, 0, g.w, g.h);
      ctx.lineJoin = "round";
      ctx.lineCap = "butt";
      ctx.strokeStyle = p.glass;
      const hw = g.tube / 2 - 0.5;
      for (const run of g.runs) {
        if (run.front !== front) continue;
        // The bore, a faint fill, then the two walls.
        ctx.globalAlpha = front ? (p.dark ? 0.07 : 0.05) : p.dark ? 0.04 : 0.03;
        ctx.lineWidth = g.tube;
        ctx.beginPath();
        trace(ctx, g, run.a * STEP, run.b * STEP, 0);
        ctx.stroke();
        ctx.globalAlpha = front ? (p.dark ? 0.36 : 0.42) : p.dark ? 0.16 : 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        trace(ctx, g, run.a * STEP, run.b * STEP, hw);
        trace(ctx, g, run.a * STEP, run.b * STEP, -hw);
        ctx.stroke();
      }
      if (front && !g.closed) {
        // The open ends of the tube: a lip across each.
        ctx.globalAlpha = p.dark ? 0.5 : 0.55;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const i of [0, g.n - 1]) {
          ctx.moveTo(
            g.x[i]! + g.nx[i]! * (hw + 1),
            g.y[i]! + g.ny[i]! * (hw + 1),
          );
          ctx.lineTo(
            g.x[i]! - g.nx[i]! * (hw + 1),
            g.y[i]! - g.ny[i]! * (hw + 1),
          );
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return c;
    };
    g.back = layer(false);
    g.front = layer(true);
  };

  /** New colours: the glass is painted again from them and the frame redrawn. */
  const repaint = () => {
    if (!geo.current) return;
    readColours();
    paintGlass();
    draw();
  };

  const rebuild = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 8 || h < 8) return;
    const scale = Math.min(window.devicePixelRatio || 1, k.dpr);
    let dense: Dense | null = null;
    const measured = measureRef.current;
    if (k.path && measured) {
      let total = 0;
      try {
        total = measured.getTotalLength();
      } catch {
        total = 0;
      }
      if (total > 0) {
        const m = Math.min(4000, Math.ceil(total));
        const px: number[] = [];
        const py: number[] = [];
        for (let i = 0; i <= m; i += 1) {
          const pt = measured.getPointAtLength((i / m) * total);
          px.push(pt.x);
          py.push(pt.y);
        }
        const minX = Math.min(...px);
        const maxX = Math.max(...px);
        const minY = Math.min(...py);
        const maxY = Math.max(...py);
        const pad = Math.max(10, k.tube * 1.8);
        const s = Math.min(
          (w - 2 * pad) / Math.max(1e-3, maxX - minX),
          (h - 2 * pad) / Math.max(1e-3, maxY - minY),
        );
        const ox = (w - (maxX - minX) * s) / 2 - minX * s;
        const oy = (h - (maxY - minY) * s) / 2 - minY * s;
        dense = {
          x: px.map((v) => v * s + ox),
          y: py.map((v) => v * s + oy),
          z: px.map(() => 1),
        };
      }
    } else if (!k.path) {
      dense = coilDense(w, h, k.tube, k.turns);
    }
    const line = dense ? resample(dense) : null;
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    if (!line) {
      geo.current = null;
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const was = geo.current;
    geo.current = {
      ...line,
      w,
      h,
      dpr: scale,
      tube: k.tube,
      fold: foldOf(line, k.tube),
      runs: runsOf(line),
      train: trainOf(line.len, k.tube, k.seed),
      back: was?.back ?? null,
      front: was?.front ?? null,
    };
    const s = sim.current;
    s.phase = s.phase % geo.current.train.period;
    s.warmAt = Math.min(s.warmAt, line.len);
    if (hand.current.present) placeHand(hand.current.at);
    if (!pal.current) readColours();
    paintGlass();
    draw();
    kick();
  };

  const speedOf = (warm: number) =>
    (14 + 150 * k.flow) * (1 + 0.9 * k.warmth * warm);

  /** Where the hand sits on the glass when it is at arc `at`. */
  const placeHand = (at: number) => {
    const g = geo.current;
    const hd = hand.current;
    if (!g) return;
    const i = clamp(Math.round(at / STEP), 0, g.n - 1);
    hd.at = i * STEP;
    hd.x = g.x[i]!;
    hd.y = g.y[i]!;
    sim.current.warmAt = hd.at;
  };

  const spawnNucleus = (at: number) => {
    const nu = nuclei.current;
    const g = geo.current;
    if (!g) return;
    const q = nu.next;
    nu.next = (nu.next + 1) % NUCLEI;
    nu.seq += 1;
    // Golden-ratio steps keep successive bubbles from looking alike.
    const f = (nu.seq * 0.618034) % 1;
    nu.at[q] = clamp(at + (f - 0.5) * g.tube * 2, 0, g.len);
    nu.r[q] = g.tube * (0.1 + 0.12 * f);
    nu.phase[q] = f * TAU;
    nu.age[q] = 0;
    nu.live[q] = 1;
  };

  const arrive = () => {
    const s = sim.current;
    s.arrived += 1;
    s.flare = 0;
    report.current.onArrive?.(s.arrived);
  };

  /** Advances the flow, the warmth and anything in flight; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const g = geo.current;
    if (!g) return false;
    const s = sim.current;
    const hd = hand.current;
    let busy = false;
    const target = hd.present && k.enabled ? s.warmTarget : 0;
    if (!k.motionSafe) {
      s.warm = target;
    } else {
      // Glass warms quickly under the hand and gives its heat back slowly.
      const rate = target > s.warm ? 7 : 1.6;
      s.warm += (target - s.warm) * (1 - Math.exp(-dt * rate));
      if (Math.abs(target - s.warm) < 0.002) s.warm = target;
      else busy = true;
    }
    const speed = speedOf(s.warm);
    if (k.motionSafe) {
      if (!k.paused) {
        s.clock += dt;
        s.phase = (s.phase + speed * dt) % g.train.period;
        busy = true;
        if (s.warm > 0.05 && k.warmth > 0 && k.enabled) {
          s.spawn += dt * s.warm * k.warmth * 12;
          while (s.spawn >= 1) {
            s.spawn -= 1;
            spawnNucleus(s.warmAt);
          }
        }
      }
      const nu = nuclei.current;
      for (let q = 0; q < NUCLEI; q += 1) {
        if (!nu.live[q]) continue;
        if (!k.paused) nu.at[q] = nu.at[q]! + speed * 1.08 * dt;
        nu.age[q] = nu.age[q]! + dt;
        if (nu.at[q]! > g.len || nu.age[q]! > 6) nu.live[q] = 0;
        else busy = true;
      }
      // A sent slug launches with a flick (a ~120 ms lag onto its speed) and
      // always crosses the run in about two seconds, however long it is.
      const cruise = g.len / (3.2 - 1.6 * k.flow);
      const take = 1 - Math.exp(-dt / 0.12);
      const sl = sent.current;
      for (let q = 0; q < SENT; q += 1) {
        if (!sl.live[q]) continue;
        sl.v[q] = sl.v[q]! + (cruise - sl.v[q]!) * take;
        sl.at[q] = sl.at[q]! + sl.v[q]! * dt;
        if (sl.at[q]! - g.tube * 4.5 > g.len) {
          sl.live[q] = 0;
          arrive();
        }
        busy = true;
      }
    } else if (s.lit > 0) {
      s.lit = Math.max(0, s.lit - dt / 0.6);
      busy = true;
    }
    if (s.flare >= 0) {
      s.flare += dt;
      if (s.flare > 0.95) s.flare = -1;
      else busy = true;
    }
    return busy;
  };

  /**
   * Gathers every slug's stretch inside [ra, rb] into the span buffer,
   * shrunk by `cap` at the slug's own ends (the meniscus a round cap draws),
   * and says how many there are.
   */
  const collect = (ra: number, rb: number, cap: number): number => {
    const g = geo.current;
    if (!g) return 0;
    const t = g.train;
    const buf = spans.current;
    const phase = sim.current.phase;
    let c = 0;
    for (let q = 0; q < t.count; q += 1) {
      for (let m = -1; m <= 0; m += 1) {
        const lo = Math.max(ra, t.starts[q]! + phase + m * t.period + cap);
        const hi = Math.min(rb, t.ends[q]! + phase + m * t.period - cap);
        if (hi - lo > 0.5 && c < SPANS) {
          buf[c * 2] = lo;
          buf[c * 2 + 1] = hi;
          c += 1;
        }
      }
    }
    return c;
  };

  const strokeSpans = (
    ctx: CanvasRenderingContext2D,
    g: Geo,
    count: number,
    off: number,
  ) => {
    const buf = spans.current;
    ctx.beginPath();
    for (let c = 0; c < count; c += 1) {
      trace(ctx, g, buf[c * 2]!, buf[c * 2 + 1]!, off);
    }
    ctx.stroke();
  };

  /** Where the coil doubles back, light from both passes adds up. */
  const strokeFolds = (
    ctx: CanvasRenderingContext2D,
    g: Geo,
    sprite: HTMLCanvasElement | null,
    lo: number,
    hi: number,
    gain: number,
    widen: number,
  ) => {
    if (!sprite) return;
    // Soft stamps a few px apart rather than a wide stroke: a crossing swells
    // into a round glow instead of a slab with square ends.
    const gap = STEP * 3;
    for (let c = lo + gap / 2; c < hi; c += gap) {
      const i = clamp(Math.round(c / STEP), 0, g.n - 1);
      const f = g.fold[i] ?? 0;
      if (f < 0.1) continue;
      const size = g.tube * (1.6 + widen * f);
      ctx.globalAlpha = Math.min(1, gain * f);
      ctx.drawImage(sprite, g.x[i]! - size / 2, g.y[i]! - size / 2, size, size);
    }
  };

  /** Adds one bubble to the current path if it rides on this side of the coil. */
  const bubbleAt = (
    ctx: CanvasRenderingContext2D,
    g: Geo,
    at: number,
    r: number,
    ph: number,
    sw: number,
    front: boolean,
  ) => {
    if (at < 1 || at > g.len - 1) return;
    const i = at / STEP;
    const i0 = Math.min(g.n - 2, Math.floor(i));
    const f = i - i0;
    const z = g.z[i0]! + (g.z[i0 + 1]! - g.z[i0]!) * f;
    if (z >= 0 !== front) return;
    const hw = g.tube / 2;
    const rr = Math.min(r, hw - 2);
    const room = Math.max(0, hw - rr - 1.8);
    const s = sim.current;
    // Bubbles sway across the bore as they ride; held still, they rest where
    // they were seeded.
    const sway = k.motionSafe ? Math.sin(s.clock * sw + ph) : Math.sin(ph);
    const off = sway * room * 0.75;
    const x = g.x[i0]! + (g.x[i0 + 1]! - g.x[i0]!) * f + g.nx[i0]! * off;
    const y = g.y[i0]! + (g.y[i0 + 1]! - g.y[i0]!) * f + g.ny[i0]! * off;
    ctx.moveTo(x + rr, y);
    ctx.arc(x, y, rr, 0, TAU);
  };

  const strokeBubbles = (
    ctx: CanvasRenderingContext2D,
    g: Geo,
    p: Palette,
    front: boolean,
  ) => {
    const t = g.train;
    const nu = nuclei.current;
    const phase = sim.current.phase;
    ctx.lineWidth = 1;
    for (let pass = 0; pass < 2; pass += 1) {
      // The gas inside first, then each bubble's bright rim.
      ctx.beginPath();
      for (let q = 0; q < k.bubbles; q += 1) {
        let at = t.at[q]! + phase;
        if (at >= t.period) at -= t.period;
        bubbleAt(ctx, g, at, t.r[q]!, t.phase[q]!, t.sway[q]!, front);
      }
      for (let q = 0; q < NUCLEI; q += 1) {
        if (nu.live[q]) {
          bubbleAt(ctx, g, nu.at[q]!, nu.r[q]!, nu.phase[q]!, 3.1, front);
        }
      }
      if (pass === 0) {
        ctx.globalAlpha = front ? 0.55 : 0.3;
        ctx.fillStyle = p.void;
        ctx.fill();
      } else {
        ctx.globalAlpha = front ? 0.9 : 0.45;
        ctx.strokeStyle = p.core;
        ctx.stroke();
      }
    }
  };

  /** The liquid on one side of the coil: its glow, its body, its core, its folds. */
  const strokeLiquid = (
    ctx: CanvasRenderingContext2D,
    g: Geo,
    p: Palette,
    front: boolean,
  ) => {
    const add: GlobalCompositeOperation = p.dark ? "lighter" : "source-over";
    const core = g.tube - 3;
    const buf = spans.current;
    for (const run of g.runs) {
      if (run.front !== front) continue;
      const ra = run.a * STEP;
      const rb = run.b * STEP;
      let count = collect(ra, rb, core / 2);
      ctx.lineCap = "round";
      if (front) {
        ctx.globalCompositeOperation = add;
        ctx.globalAlpha = p.dark ? 0.16 : 0.12;
        ctx.strokeStyle = p.dark ? p.core : p.body;
        ctx.lineWidth = g.tube + 6;
        strokeSpans(ctx, g, count, 0);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = front ? 0.95 : 0.5;
      ctx.strokeStyle = p.body;
      ctx.lineWidth = front ? core : core * 0.9;
      strokeSpans(ctx, g, count, 0);
      if (front) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = p.core;
        ctx.lineWidth = Math.max(1.5, core * 0.36);
        strokeSpans(ctx, g, count, -core * 0.12);
      }
      if (k.glow > 0) {
        count = collect(ra, rb, 0);
        ctx.globalCompositeOperation = add;
        for (let c = 0; c < count; c += 1) {
          strokeFolds(
            ctx,
            g,
            p.glow,
            buf[c * 2]!,
            buf[c * 2 + 1]!,
            k.glow * (p.dark ? 0.16 : 0.1) * (front ? 1 : 0.6),
            2.6,
          );
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }
  };

  /**
   * Sent slugs on one side of the coil: a white-hot slug with a halo, every
   * crossing it passes flashing, and a glow at its head.
   */
  const strokeSent = (
    ctx: CanvasRenderingContext2D,
    g: Geo,
    p: Palette,
    front: boolean,
  ) => {
    const add: GlobalCompositeOperation = p.dark ? "lighter" : "source-over";
    const sl = sent.current;
    const lb = g.tube * 4.5;
    for (let q = 0; q < SENT; q += 1) {
      if (!sl.live[q]) continue;
      const head = sl.at[q]!;
      for (const run of g.runs) {
        if (run.front !== front) continue;
        const ra = run.a * STEP;
        const rb = run.b * STEP;
        const lo = Math.max(ra, head - lb);
        const hi = Math.min(rb, head);
        const flashLo = Math.max(ra, head - lb - 40);
        const flashHi = Math.min(rb, head + 12);
        ctx.globalCompositeOperation = add;
        ctx.strokeStyle = p.dark ? p.bright : p.body;
        if (flashHi - flashLo > 0.5) {
          strokeFolds(
            ctx,
            g,
            p.glow,
            flashLo,
            flashHi,
            (0.12 + k.glow * 0.3) * (front ? 1 : 0.6),
            4,
          );
        }
        if (hi - lo < 0.5) {
          ctx.globalCompositeOperation = "source-over";
          continue;
        }
        ctx.lineCap = "round";
        ctx.globalAlpha = (p.dark ? 0.32 : 0.22) * (front ? 1 : 0.6);
        ctx.lineWidth = g.tube + 14;
        ctx.beginPath();
        trace(ctx, g, lo, hi, 0);
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = front ? 1 : 0.6;
        ctx.strokeStyle = p.bright;
        ctx.lineWidth = g.tube - 3;
        ctx.stroke();
        if (p.glow && front && head <= rb && head >= ra) {
          const i = clamp(Math.round(head / STEP), 0, g.n - 1);
          const size = g.tube * 5;
          ctx.globalCompositeOperation = add;
          ctx.globalAlpha = 0.8;
          ctx.drawImage(
            p.glow,
            g.x[i]! - size / 2,
            g.y[i]! - size / 2,
            size,
            size,
          );
          ctx.globalCompositeOperation = "source-over";
        }
      }
    }
  };

  const draw = () => {
    const g = geo.current;
    const p = pal.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!g || !p || !canvas || !ctx) return;
    const s = sim.current;
    const add: GlobalCompositeOperation = p.dark ? "lighter" : "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (g.back) ctx.drawImage(g.back, 0, 0);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.lineJoin = "round";

    // Behind the coil first, then the front glass over it, then the front.
    strokeLiquid(ctx, g, p, false);
    strokeBubbles(ctx, g, p, false);
    strokeSent(ctx, g, p, false);
    if (g.front) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(g.front, 0, 0);
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    }

    // Warm glass: a halo along the tube nearest the hand.
    if (s.warm > 0.01 && k.warmth > 0) {
      ctx.globalCompositeOperation = add;
      ctx.strokeStyle = p.warm;
      ctx.lineCap = "butt";
      ctx.lineWidth = g.tube + 12;
      const reach = 30 + 40 * k.warmth;
      for (let c = s.warmAt - reach; c < s.warmAt + reach; c += STEP * 3) {
        const lo = Math.max(0, c);
        const hi = Math.min(g.len, c + STEP * 3);
        if (hi - lo < 0.5) continue;
        const d = (lo + hi) / 2 - s.warmAt;
        ctx.globalAlpha =
          s.warm *
          (p.dark ? 0.4 + 0.5 * k.warmth : 0.25 + 0.4 * k.warmth) *
          Math.exp(-(d * d) / (reach * reach * 0.36));
        ctx.beginPath();
        trace(ctx, g, lo, hi, 0);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    strokeLiquid(ctx, g, p, true);
    strokeBubbles(ctx, g, p, true);

    // The glass's own shine along the upper wall of every front pass.
    ctx.globalAlpha = p.dark ? 0.5 : 0.9;
    ctx.strokeStyle = p.shine;
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const run of g.runs) {
      if (run.front) trace(ctx, g, run.a * STEP, run.b * STEP, NaN);
    }
    ctx.stroke();

    strokeSent(ctx, g, p, true);

    // Reduced motion: a send lights the whole run at once, then fades.
    if (s.lit > 0) {
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = add;
      ctx.globalAlpha = s.lit * (p.dark ? 0.3 : 0.2);
      ctx.strokeStyle = p.dark ? p.bright : p.body;
      ctx.lineWidth = g.tube + 12;
      ctx.beginPath();
      trace(ctx, g, 0, g.len, 0);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = s.lit * 0.9;
      ctx.strokeStyle = p.bright;
      ctx.lineWidth = g.tube - 3;
      ctx.stroke();
    }

    // The outlet's flare: it blooms with the recoil spring's overshoot and
    // fades as it rings down. Reduced motion keeps only the fade.
    if (s.flare >= 0 && p.glow && !g.closed) {
      const i = g.n - 1;
      const tx = g.ny[i]!;
      const ty = -g.nx[i]!;
      const bloom = k.motionSafe ? RECOIL(s.flare) : 1;
      const size = g.tube * (2.5 + 4.5 * Math.max(0, bloom));
      const x = g.x[i]! + tx * g.tube * 0.6;
      const y = g.y[i]! + ty * g.tube * 0.6;
      ctx.globalCompositeOperation = add;
      ctx.globalAlpha = clamp01(1 - s.flare / 0.95);
      ctx.drawImage(p.glow, x - size / 2, y - size / 2, size, size);
      ctx.globalCompositeOperation = "source-over";
    }

    // The keyboard's hand: a small ring on the glass.
    const hd = hand.current;
    if (hd.present && hd.source === "key" && k.enabled) {
      if (p.ember && s.warm > 0.01) {
        const size = g.tube * 4;
        ctx.globalCompositeOperation = add;
        ctx.globalAlpha = s.warm * 0.6;
        ctx.drawImage(p.ember, hd.x - size / 2, hd.y - size / 2, size, size);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = p.glass;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, g.tube * 0.95, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden || !geo.current) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { rebuild, repaint, draw, kick, tick };
    report.current = { onSend, onArrive };
  });

  React.useEffect(() => {
    api.current?.rebuild();
  }, [k.tube, k.turns, k.path, k.seed, k.dpr]);

  React.useEffect(() => {
    api.current?.repaint();
  }, [tint, glassColor, warmColor]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.flow, k.bubbles, k.glow, k.warmth, paused, motionSafe, k.enabled]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.rebuild());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const send = () => {
    const g = geo.current;
    if (!k.enabled || !g) return;
    const s = sim.current;
    const sl = sent.current;
    const q = sl.live.indexOf(0);
    // Six slugs can run at once; a seventh waits for the glass to clear.
    if (k.motionSafe && q < 0) return;
    report.current.onSend?.();
    setSaid((v) => ({
      n: v.n + 1,
      text: "A bright slug runs through the coil.",
    }));
    if (!k.motionSafe) {
      s.lit = 1;
      arrive();
    } else {
      sl.at[q] = 0;
      sl.v[q] = 0;
      sl.live[q] = 1;
    }
    kick();
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return { x: 0, y: 0 };
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** The pointer's hand: the glass nearest it warms, more the nearer it is. */
  const handTo = (clientX: number, clientY: number) => {
    const g = geo.current;
    if (!g || !k.enabled) return;
    const at = local(clientX, clientY);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < g.n; i += 2) {
      const dx = g.x[i]! - at.x;
      const dy = g.y[i]! - at.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const hd = hand.current;
    hd.present = true;
    hd.source = "pointer";
    placeHand(best * STEP);
    hd.x = at.x;
    hd.y = at.y;
    const d = Math.sqrt(bestD);
    sim.current.warmTarget = Math.exp(-(d * d) / (46 * 46));
    kick();
  };

  const handLeave = () => {
    const hd = hand.current;
    hd.present = false;
    hd.source = null;
    sim.current.warmTarget = 0;
    kick();
  };

  const drag = useDrag({
    threshold: 6,
    disabled: !k.enabled,
    onStart: ({ point, event }) => {
      if (event.pointerType !== "mouse") handTo(point.x, point.y);
    },
    onMove: ({ point, event }) => {
      if (event.pointerType !== "mouse") handTo(point.x, point.y);
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "mouse") handLeave();
    },
    onCancel: () => handLeave(),
    onTap: () => send(),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || fromContent(event.target)) return;
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (
      event.pointerType === "mouse" &&
      k.enabled &&
      !fromContent(event.target)
    ) {
      handTo(event.clientX, event.clientY);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const g = geo.current;
    if (!k.enabled || !g) return;
    const dir =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    const hd = hand.current;
    if (dir !== 0) {
      event.preventDefault();
      const from = hd.present && hd.source === "key" ? hd.at : g.len / 2;
      const by = (g.len / 24) * (event.shiftKey ? 3 : 1);
      hd.present = true;
      hd.source = "key";
      placeHand(clamp(from + dir * by, 0, g.len));
      sim.current.warmTarget = 1;
      kick();
      return;
    }
    if (event.key === "Escape" && hd.present && hd.source === "key") {
      event.preventDefault();
      handLeave();
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    const g = geo.current;
    if (!g || !k.enabled || !event.currentTarget.matches(":focus-visible"))
      return;
    const hd = hand.current;
    hd.present = true;
    hd.source = "key";
    placeHand(g.len / 2);
    sim.current.warmTarget = 0.5;
    kick();
  };

  const onBlur = () => {
    if (hand.current.source === "key") handLeave();
  };

  const onColours = () => api.current?.repaint();

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== "touch" &&
          hand.current.source === "pointer"
        ) {
          handLeave();
        }
      }}
      className={cn(
        "group/condenser-coil relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <CoilStill
        path={path}
        viewBox={viewBox}
        tube={tube}
        turns={wantTurns}
        seed={seed}
        tint={tint}
        glassColor={glassColor}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[glassColor, warmColor, "var(--background)"].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      {path ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute size-0 overflow-hidden"
        >
          <path ref={measureRef} d={path} />
        </svg>
      ) : null}
      <button
        type="button"
        data-coil=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it sends a slug, the same as a tap.
          if (event.detail === 0) send();
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-pointer" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Enter or Space sends a bright slug through the coil. Arrow keys move a
        warm hand along the glass; Escape takes it away.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * Adds the tube from arc `a` to arc `b` (px) to the current path, offset
 * `off` px along the normal. A NaN offset is the shine line: it leans toward
 * the light, so it crosses the bore smoothly where the tube turns instead of
 * jumping from one wall to the other.
 */
function trace(
  ctx: CanvasRenderingContext2D,
  g: Line & { tube: number },
  a: number,
  b: number,
  off: number,
) {
  const n = g.n;
  const shine = Number.isNaN(off);
  const lean = g.tube * 0.27;
  const ia = clamp(a / STEP, 0, n - 1);
  const ib = clamp(b / STEP, 0, n - 1);
  const i0 = Math.min(n - 2, Math.floor(ia));
  const f0 = ia - i0;
  let o = shine ? lean * (g.nx[i0]! * LIGHT_X + g.ny[i0]! * LIGHT_Y) : off;
  ctx.moveTo(
    g.x[i0]! + (g.x[i0 + 1]! - g.x[i0]!) * f0 + g.nx[i0]! * o,
    g.y[i0]! + (g.y[i0 + 1]! - g.y[i0]!) * f0 + g.ny[i0]! * o,
  );
  const last = Math.floor(ib);
  for (let i = i0 + 1; i <= last; i += 1) {
    if (shine) o = lean * (g.nx[i]! * LIGHT_X + g.ny[i]! * LIGHT_Y);
    ctx.lineTo(g.x[i]! + g.nx[i]! * o, g.y[i]! + g.ny[i]! * o);
  }
  if (ib > last && last < n - 1) {
    const f = ib - last;
    ctx.lineTo(
      g.x[last]! + (g.x[last + 1]! - g.x[last]!) * f + g.nx[last]! * o,
      g.y[last]! + (g.y[last + 1]! - g.y[last]!) * f + g.ny[last]! * o,
    );
  }
}

/**
 * The designed still for the server render and the first paint: the
 * generated coil at the card's size, its glass and its slugs at rest, drawn
 * as SVG that stretches to the box until the canvas takes over. A host path
 * is shown in its own `viewBox` when one is given.
 */
function CoilStill({
  path,
  viewBox,
  tube,
  turns,
  seed,
  tint,
  glassColor,
}: {
  path?: string;
  viewBox?: string;
  tube: number;
  turns: number | undefined;
  seed: number;
  tint: number;
  glassColor: string;
}) {
  const shape = React.useMemo(() => {
    if (path) return null;
    const line = resample(coilDense(STILL_W, STILL_H, tube, turns));
    if (!line) return null;
    const pathOf = (a: number, b: number) => {
      let d = "";
      for (let i = a; i <= b; i += i < b - 2 ? 2 : 1) {
        d += `${d ? "L" : "M"}${r1(line.x[i]!)} ${r1(line.y[i]!)}`;
      }
      return d;
    };
    let back = "";
    let front = "";
    for (const run of runsOf(line)) {
      if (run.front) front += pathOf(run.a, run.b);
      else back += pathOf(run.a, run.b);
    }
    const train = trainOf(line.len, tube, seed);
    let slugs = "";
    const cap = (tube - 3) / 2;
    for (let q = 0; q < train.count; q += 1) {
      const lo = Math.round((train.starts[q]! + cap) / STEP);
      const hi = Math.min(
        line.n - 1,
        Math.round((train.ends[q]! - cap) / STEP),
      );
      if (hi - lo >= 1) slugs += pathOf(lo, hi);
    }
    return { back, front, slugs };
  }, [path, tube, turns, seed]);

  const liquid = `oklch(0.7 0.14 ${tint})`;
  const common = {
    fill: "none",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  if (path) {
    if (!viewBox) return null;
    return (
      <svg
        aria-hidden
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full p-4 transition-opacity duration-300 group-data-live/condenser-coil:opacity-0"
        style={{ color: glassColor }}
      >
        <path
          d={path}
          {...common}
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={tube}
        />
        <path d={path} {...common} stroke={liquid} strokeWidth={tube - 4} />
      </svg>
    );
  }
  if (!shape) return null;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${STILL_W} ${STILL_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/condenser-coil:opacity-0"
      style={{ color: glassColor }}
    >
      <path
        d={shape.back}
        {...common}
        stroke="currentColor"
        strokeOpacity={0.06}
        strokeWidth={tube}
      />
      <path
        d={shape.front}
        {...common}
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={tube}
      />
      <path
        d={shape.slugs}
        {...common}
        stroke={liquid}
        strokeOpacity={0.85}
        strokeWidth={tube - 3}
      />
    </svg>
  );
}
