"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/**
 * A picture function: given a hole's place on the board — `u` across from
 * the middle and `v` down, both in board heights, and the board's aspect —
 * the index of the peg colour it takes, or -1 for an empty hole.
 */
export type PegDraw = (u: number, v: number, aspect: number) => number;

export type PegPicture = {
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** An image, reduced to pegs: each hole takes the nearest peg colour; dark or clear becomes empty. */
  src?: string;
  /** A word or two in a 5 × 7 peg alphabet (A–Z, 0–9 and . ! ? - &), set in 3 × 5 when the board is too narrow. */
  text?: string;
  /** The colour of `text`, as an index into `colors`. @default 1 */
  color?: number;
  /** A drawn picture. */
  draw?: PegDraw;
};

export type PegMigrationProps = {
  /** The pictures, in order. @default a sun on the sea, a koi, a moon over a ridge, a tulip */
  images?: PegPicture[];
  /** The picture showing (controlled). */
  value?: number;
  /** The picture showing at first when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the click or key that asked for another picture. */
  onValueChange?: (index: number) => void;
  /** Distance between holes, px (9 to 21): a fine board to a chunky toy. Narrow boards go finer so a word still reads. @default 13 */
  pitch?: number;
  /** How quickly pegs hop, 0.5 to 2. @default 1 */
  hopSpeed?: number;
  /** How far each peg's light blooms around it, 0 to 1. @default 0.6 */
  glow?: number;
  /** The peg colours, any CSS colours; pictures index into them. @default seven pigments from the tokens */
  colors?: string[];
  /** The board's colour, any CSS colour. @default a near-black pigment */
  board?: string;
  /** How high pegs arc as they hop, 0 to 1. @default 0.5 */
  hopHeight?: number;
  /** How long the wave takes to cross the board, 0 (all at once) to 1 (a slow sweep). @default 0.5 */
  spread?: number;
  /** Moves to the next picture on its own every so many ms while on screen and not hovered or focused; 0 never. @default 0 */
  interval?: number;
  /** Seeds the small differences in each peg's timing. @default 1 */
  seed?: number;
  /** A tick as each peg lands, pitched by its colour. Off unless asked for. @default false */
  sound?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The board's accessible name. @default "Pegboard" */
  label?: string;
  /** No changing pictures. @default false */
  disabled?: boolean;
  /** Sizes the board; 3:1 and the full width by default. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A small hash of two numbers, unsigned: the same "random" for the same place. */
function hash2(a: number, b: number): number {
  let h = Math.imul(Math.round(a * 1000) ^ 0x2c1b3c6d, 0x297a2d39);
  h = Math.imul(h ^ Math.round(b * 1000) ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

/* ------------------------------------------------------------------------ */
/* Pictures. Colour indices: 0 red, 1 amber, 2 yellow, 3 green, 4 blue,      */
/* 5 rose, 6 white.                                                           */
/* ------------------------------------------------------------------------ */

const sunset: PegDraw = (u, v) => {
  const horizon = 0.62;
  if (v < horizon) {
    const r = Math.hypot(u, (v - horizon) * 1.05);
    if (r < 0.15) return 2;
    if (r < 0.25) return 1;
    if (r < 0.34) return 0;
    if (Math.abs(v - 0.2) < 0.035 && u > -1.3 && u < -0.42) return 5;
    if (Math.abs(v - 0.3) < 0.035 && u > 0.5 && u < 1.25) return 5;
    return -1;
  }
  const depth = v - horizon;
  if (Math.abs(u) < 0.2 - depth * 0.35 && Math.sin(v * 70) > -0.2) {
    return depth < 0.12 ? 2 : 1;
  }
  return Math.sin(u * 9 + v * 46) > 0.15 ? 4 : -1;
};

const koi: PegDraw = (u, v, a) => {
  const x = u - 0.05;
  const y = v - 0.5;
  const body = (x / 0.5) ** 2 + (y / 0.19) ** 2;
  if (Math.hypot(x + 0.36, y + 0.05) < 0.045) return -1;
  if (body < 1) {
    if (x < -0.18 && y < 0.02 && body > 0.25) return 0;
    if (Math.sin(x * 11 + 1.2) > 0.55 && y < 0.1) return 6;
    return 1;
  }
  const tail = x - 0.48;
  if (tail > 0 && tail < 0.3 && Math.abs(y) < tail * 0.95 + 0.04) return 1;
  if (
    y > 0.15 &&
    y < 0.28 &&
    x > -0.1 &&
    x < 0.12 &&
    y - 0.15 < (x + 0.1) * 0.6
  )
    return 1;
  // Three bubbles off the koi's mouth.
  for (const [bx, by, br] of [
    [-0.7, 0.32, 0.045],
    [-0.82, 0.18, 0.032],
    [-0.77, 0.05, 0.022],
  ] as const) {
    if (Math.abs(Math.hypot(u - bx, v - by) - br) < 0.022) return 4;
  }
  // Lily pads where the board is wide enough to leave the koi room.
  for (const side of [-1, 1]) {
    const px = side * Math.min(a / 2 - 0.3, 1.25);
    if (Math.abs(px) < 1) continue;
    const py = side > 0 ? 0.36 : 0.62;
    const d = Math.hypot(u - px, (v - py) * 1.3);
    const notch = Math.atan2(v - py, u - px);
    if (d < 0.2 && !(Math.abs(notch - (side > 0 ? 2.4 : -0.6)) < 0.32)) {
      return d < 0.06 ? 5 : 3;
    }
    if (Math.abs(d - 0.3) < 0.025) return 4;
  }
  return -1;
};

const moonRidge: PegDraw = (u, v) => {
  const mx = 0.46;
  const my = 0.27;
  const disc = Math.hypot(u - mx, v - my) < 0.21;
  const bite = Math.hypot(u - mx - 0.1, v - my + 0.05) < 0.18;
  if (disc && !bite) return 2;
  // Near hills in front, a snow-capped range behind them.
  const near = 0.8 - 0.07 * Math.sin(u * 3 + 1);
  if (v > near) return 3;
  const far =
    0.66 -
    0.34 * Math.max(0, 1 - Math.abs(u + 0.3) / 0.5) -
    0.24 * Math.max(0, 1 - Math.abs(u - 0.62) / 0.42) -
    0.05 * Math.sin(u * 5);
  if (v > far) return v < far + 0.09 && far < 0.48 ? 6 : 4;
  const clear = Math.hypot(u - mx, v - my) > 0.3;
  if (
    clear &&
    v < far - 0.1 &&
    hash2(Math.round(u * 14), Math.round(v * 14)) > 0.955
  )
    return 6;
  return -1;
};

const tulip: PegDraw = (u, v, a) => {
  if (Math.abs(u) < 0.025 && v > 0.42 && v < 0.95) return 3;
  const leaf = (cx: number, tilt: number) => {
    const x = u - cx;
    const y = v - 0.74;
    const rx = x * Math.cos(tilt) + y * Math.sin(tilt);
    const ry = -x * Math.sin(tilt) + y * Math.cos(tilt);
    return (rx / 0.16) ** 2 + (ry / 0.05) ** 2 < 1;
  };
  if (leaf(-0.12, 0.7) || leaf(0.12, -0.7)) return 3;
  const cup = (u / 0.17) ** 2 + ((v - 0.3) / 0.15) ** 2 < 1;
  const tips =
    v < 0.24 &&
    v > 0.1 &&
    (Math.abs(u) < 0.04 || Math.abs(Math.abs(u) - 0.12) < 0.045);
  if (cup || (tips && Math.abs(u) < 0.17)) {
    return Math.abs(u) < 0.05 && v > 0.22 ? 5 : 0;
  }
  // A bed of small flowers along the foot of the board.
  if (v > 0.84 && Math.abs(u) > 0.3) {
    const k = Math.round(u * 6);
    const fx = k / 6;
    if (Math.abs(u - fx) < 0.03 && v > 0.88) return 3;
    if (Math.abs(u - fx) < 0.05 && v < 0.88)
      return [0, 1, 5, 2][Math.abs(k) % 4] ?? 0;
  }
  if (a > 2.4 && v > 0.95) return 3;
  return -1;
};

export const defaultPegPictures: PegPicture[] = [
  { alt: "A sun setting over a striped sea", draw: sunset },
  { alt: "An orange and white koi with three bubbles", draw: koi },
  { alt: "A crescent moon over a snow-capped ridge", draw: moonRidge },
  { alt: "A red tulip above a bed of small flowers", draw: tulip },
];

const DEFAULT_COLORS = [
  "oklch(from var(--danger) 0.64 0.21 h)",
  "oklch(from var(--warn) 0.76 0.17 h)",
  "oklch(from var(--warn) 0.9 0.16 calc(h + 22))",
  "oklch(from var(--success) 0.74 0.18 h)",
  "oklch(from var(--accent) 0.66 0.17 h)",
  "oklch(from var(--danger) 0.74 0.15 calc(h - 28))",
  "oklch(0.97 0.012 90)",
];

/* 5 × 7 peg alphabet, one five-bit row per number, the leftmost bit high. */
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 17, 25, 21, 19, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "&": [12, 18, 20, 8, 21, 18, 13],
};

/* 3 × 5 peg alphabet for narrow boards, one three-bit row per number. */
const SMALL: Record<string, number[]> = {
  A: [2, 5, 7, 5, 5],
  B: [6, 5, 6, 5, 6],
  C: [3, 4, 4, 4, 3],
  D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4],
  G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7],
  J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5],
  L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5],
  N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3],
  R: [6, 5, 6, 5, 5],
  S: [3, 4, 2, 1, 6],
  T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2],
  W: [5, 5, 7, 7, 5],
  X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  "0": [7, 5, 5, 5, 7],
  "1": [2, 6, 2, 2, 7],
  "2": [6, 1, 2, 4, 7],
  "3": [6, 1, 2, 1, 6],
  "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 6, 1, 6],
  "6": [3, 4, 7, 5, 7],
  "7": [7, 1, 2, 2, 2],
  "8": [7, 5, 7, 5, 7],
  "9": [7, 5, 7, 1, 6],
  " ": [0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 2],
  "!": [2, 2, 2, 0, 2],
  "?": [6, 1, 2, 0, 2],
  "-": [0, 0, 7, 0, 0],
  "&": [2, 5, 2, 5, 3],
};

/* ------------------------------------------------------------------------ */
/* The board's lattice.                                                      */
/* ------------------------------------------------------------------------ */

type Grid = {
  cols: number;
  rows: number;
  pitch: number;
  rowH: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  /** Hole centres, x then y, row by row. */
  xy: Float32Array;
  count: number;
};

function gridOf(w: number, h: number, pitch: number): Grid {
  const p = clamp(pitch, 6, 40);
  const rowH = p * 0.866;
  const margin = p * 0.8;
  const cols = Math.max(1, Math.floor((w - 2 * margin - p / 2) / p) + 1);
  const rows = Math.max(1, Math.floor((h - 2 * margin) / rowH) + 1);
  const ox = (w - ((cols - 1) * p + p / 2)) / 2;
  const oy = (h - (rows - 1) * rowH) / 2;
  const xy = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      xy[i * 2] = ox + c * p + (r % 2 ? p / 2 : 0);
      xy[i * 2 + 1] = oy + r * rowH;
    }
  }
  return { cols, rows, pitch: p, rowH, ox, oy, w, h, xy, count: cols * rows };
}

const nearestHole = (g: Grid, x: number, y: number): number => {
  const r = clamp(Math.round((y - g.oy) / g.rowH), 0, g.rows - 1);
  const c = clamp(
    Math.round((x - g.ox - (r % 2 ? g.pitch / 2 : 0)) / g.pitch),
    0,
    g.cols - 1,
  );
  return r * g.cols + c;
};

/** The colour of every hole for a picture, or -1. Images use `sampled` when loaded. */
function colourMap(
  g: Grid,
  picture: PegPicture | undefined,
  sampled: Int8Array | null,
): Int8Array {
  const out = new Int8Array(g.count).fill(-1);
  if (!picture) return out;
  if (picture.src) {
    if (sampled && sampled.length === g.count) out.set(sampled);
    return out;
  }
  if (picture.text) {
    const text = picture.text.toUpperCase();
    // The largest face that fits: 5 × 7 doubled, 5 × 7, 3 × 5 doubled, 3 × 5.
    const faces = [
      { font: FONT, w: 5, h: 7, scale: 2 },
      { font: FONT, w: 5, h: 7, scale: 1 },
      { font: SMALL, w: 3, h: 5, scale: 2 },
      { font: SMALL, w: 3, h: 5, scale: 1 },
    ];
    const fits = (f: (typeof faces)[number]) =>
      (text.length * (f.w + 1) - 1) * f.scale <= g.cols &&
      f.h * f.scale <= g.rows;
    const face = faces.find(fits) ?? faces[faces.length - 1];
    if (!face) return out;
    const width = text.length * (face.w + 1) - 1;
    const scale = face.scale;
    const c0 = Math.floor((g.cols - width * scale) / 2);
    const r0 = Math.floor((g.rows - face.h * scale) / 2);
    const colour = picture.color ?? 1;
    [...text].forEach((ch, k) => {
      const rows = face.font[ch] ?? face.font[" "] ?? [];
      rows.forEach((bits, ry) => {
        for (let bx = 0; bx < face.w; bx += 1) {
          if (!(bits & (1 << (face.w - 1 - bx)))) continue;
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              const c = c0 + (k * (face.w + 1) + bx) * scale + sx;
              const r = r0 + ry * scale + sy;
              if (c >= 0 && c < g.cols && r >= 0 && r < g.rows) {
                out[r * g.cols + c] = colour;
              }
            }
          }
        }
      });
    });
    return out;
  }
  const draw = picture.draw;
  if (!draw) return out;
  const aspect = g.w / Math.max(1, g.h);
  for (let i = 0; i < g.count; i += 1) {
    const x = g.xy[i * 2] ?? 0;
    const y = g.xy[i * 2 + 1] ?? 0;
    out[i] = draw((x - g.w / 2) / g.h, y / g.h, aspect);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* The engine.                                                               */
/* ------------------------------------------------------------------------ */

type Peg = {
  color: number;
  /** Landing points, start first, in px. */
  path: number[];
  /** Start of each hop, ms after `start`, and each hop's length in ms. */
  at: number[];
  dur: number[];
  start: number;
  /** Arc height per hop, px. */
  arc: number[];
  hole: number;
  exit: boolean;
  done: boolean;
  landedAt: number;
  /** Reduced motion: fading in (1) or out (-1), with when it began. */
  fade: number;
  fadeAt: number;
  x: number;
  y: number;
  lift: number;
};

type Config = {
  pitch: number;
  hopSpeed: number;
  glow: number;
  hopHeight: number;
  spread: number;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** Shows `colours` (a picture's map), the wave starting at (x, y) px. */
  show: (
    picture: PegPicture | undefined,
    origin: { x: number; y: number } | null,
    audible: boolean,
  ) => void;
  size: () => { w: number; h: number };
  moving: () => number;
  dispose: () => void;
};

type Hooks = {
  onLand: (color: number, x: number) => void;
  onSettle: () => void;
};

/** Any CSS colour as 0–255 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [128, 128, 128];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  hooks: { current: Hooks },
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let grid: Grid = gridOf(10, 10, 13);
  let pegs: Peg[] = [];
  let palette: [number, number, number][] = [];
  let boardRgb: [number, number, number] = [24, 24, 28];
  let picture: PegPicture | undefined;
  let sampled: Int8Array | null = null;
  let sampledFor = "";
  let image: HTMLImageElement | null = null;
  let audible = false;
  const size = { w: 0, h: 0, scale: 1 };
  let boardCanvas: HTMLCanvasElement | null = null;
  let pegSprites: HTMLCanvasElement[] = [];
  let glowSprites: HTMLCanvasElement[] = [];
  let lastLanding = 0;

  const now = () => performance.now();

  /* ------------------------------ sprites -------------------------------- */

  const paintBoard = () => {
    const tw = Math.max(1, Math.round(size.w * size.scale));
    const th = Math.max(1, Math.round(size.h * size.scale));
    boardCanvas ??= document.createElement("canvas");
    boardCanvas.width = tw;
    boardCanvas.height = th;
    const g = boardCanvas.getContext("2d");
    if (!g) return;
    g.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    const [br, bg, bb] = boardRgb;
    g.fillStyle = `rgb(${br}, ${bg}, ${bb})`;
    g.fillRect(0, 0, size.w, size.h);
    // The light behind the board shows faintly through the middle.
    const back = g.createRadialGradient(
      size.w / 2,
      size.h / 2,
      0,
      size.w / 2,
      size.h / 2,
      Math.max(size.w, size.h) * 0.6,
    );
    back.addColorStop(0, "rgba(255, 255, 255, 0.05)");
    back.addColorStop(1, "rgba(255, 255, 255, 0)");
    g.fillStyle = back;
    g.fillRect(0, 0, size.w, size.h);
    const hr = grid.pitch * 0.2;
    for (let i = 0; i < grid.count; i += 1) {
      const x = grid.xy[i * 2] ?? 0;
      const y = grid.xy[i * 2 + 1] ?? 0;
      g.beginPath();
      g.arc(x, y + 0.6, hr, 0, Math.PI * 2);
      g.fillStyle = "rgba(255, 255, 255, 0.07)";
      g.fill();
      g.beginPath();
      g.arc(x, y, hr, 0, Math.PI * 2);
      g.fillStyle = "rgba(0, 0, 0, 0.55)";
      g.fill();
    }
  };

  const paintSprites = () => {
    const c = cfg;
    if (!c) return;
    const p = grid.pitch;
    const s = size.scale;
    const pr = p * 0.4;
    const gr = p * lerp(0.9, 2.1, clamp(c.glow, 0, 1));
    pegSprites = palette.map(([r, g, b]) => {
      const box = Math.ceil(pr * 2 * s) + 2;
      const cv = document.createElement("canvas");
      cv.width = box;
      cv.height = box;
      const x = cv.getContext("2d");
      if (!x) return cv;
      x.setTransform(s, 0, 0, s, box / 2, box / 2);
      x.beginPath();
      x.arc(0, 0, pr, 0, Math.PI * 2);
      x.fillStyle = `rgb(${r}, ${g}, ${b})`;
      x.fill();
      // Lit from inside: a bright core, a deeper rim, a small sheen.
      const core = x.createRadialGradient(-pr * 0.15, -pr * 0.2, 0, 0, 0, pr);
      core.addColorStop(0, "rgba(255, 255, 255, 0.55)");
      core.addColorStop(0.45, "rgba(255, 255, 255, 0.08)");
      core.addColorStop(0.8, "rgba(0, 0, 0, 0.05)");
      core.addColorStop(1, "rgba(0, 0, 0, 0.32)");
      x.fillStyle = core;
      x.fill();
      x.beginPath();
      x.ellipse(
        -pr * 0.32,
        -pr * 0.38,
        pr * 0.24,
        pr * 0.15,
        -0.5,
        0,
        Math.PI * 2,
      );
      x.fillStyle = "rgba(255, 255, 255, 0.7)";
      x.fill();
      return cv;
    });
    glowSprites = palette.map(([r, g, b]) => {
      const box = Math.ceil(gr * 2 * s) + 2;
      const cv = document.createElement("canvas");
      cv.width = box;
      cv.height = box;
      const x = cv.getContext("2d");
      if (!x) return cv;
      x.setTransform(s, 0, 0, s, box / 2, box / 2);
      const halo = x.createRadialGradient(0, 0, 0, 0, 0, gr);
      halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.6)`);
      halo.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.2)`);
      halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      x.fillStyle = halo;
      x.fillRect(-gr, -gr, gr * 2, gr * 2);
      return cv;
    });
  };

  /* ------------------------------- images -------------------------------- */

  const sample = () => {
    const src = picture?.src;
    if (!src || !image || !image.complete || image.naturalWidth === 0) {
      return;
    }
    const cv = document.createElement("canvas");
    const w = Math.max(1, Math.round(size.w / 2));
    const h = Math.max(1, Math.round(size.h / 2));
    cv.width = w;
    cv.height = h;
    const x = cv.getContext("2d", { willReadFrequently: true });
    if (!x) return;
    // Cover the board with the picture, cropping the longer side.
    const ia = image.naturalWidth / image.naturalHeight;
    const ba = w / h;
    const sw = ia > ba ? image.naturalHeight * ba : image.naturalWidth;
    const sh = ia > ba ? image.naturalHeight : image.naturalWidth / ba;
    x.drawImage(
      image,
      (image.naturalWidth - sw) / 2,
      (image.naturalHeight - sh) / 2,
      sw,
      sh,
      0,
      0,
      w,
      h,
    );
    let data: Uint8ClampedArray;
    try {
      data = x.getImageData(0, 0, w, h).data;
    } catch {
      return;
    }
    const out = new Int8Array(grid.count).fill(-1);
    for (let i = 0; i < grid.count; i += 1) {
      const px = clamp(Math.round((grid.xy[i * 2] ?? 0) / 2), 0, w - 1);
      const py = clamp(Math.round((grid.xy[i * 2 + 1] ?? 0) / 2), 0, h - 1);
      const k = (py * w + px) * 4;
      const r = data[k] ?? 0;
      const g = data[k + 1] ?? 0;
      const b = data[k + 2] ?? 0;
      const a = data[k + 3] ?? 0;
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (a < 128 || luma < 0.14) continue;
      let best = -1;
      let bestD = Infinity;
      palette.forEach(([pr, pg, pb], j) => {
        const d =
          (r - pr) ** 2 * 0.3 + (g - pg) ** 2 * 0.59 + (b - pb) ** 2 * 0.11;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      out[i] = best;
    }
    sampled = out;
    sampledFor = `${src}|${grid.count}|${grid.cols}`;
  };

  /* ------------------------------ planning ------------------------------- */

  const pegAt = (color: number, hole: number): Peg => {
    const x = grid.xy[hole * 2] ?? 0;
    const y = grid.xy[hole * 2 + 1] ?? 0;
    return {
      color,
      path: [x, y],
      at: [],
      dur: [],
      arc: [],
      start: 0,
      hole,
      exit: false,
      done: true,
      landedAt: -1e9,
      fade: 0,
      fadeAt: 0,
      x,
      y,
      lift: 0,
    };
  };

  /** Puts the picture straight onto the board, no travel. */
  const place = (map: Int8Array) => {
    pegs = [];
    for (let i = 0; i < map.length; i += 1) {
      const colour = map[i] ?? -1;
      if (colour >= 0) pegs.push(pegAt(colour, i));
    }
  };

  const route = (
    peg: Peg,
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    delay: number,
    t0: number,
  ) => {
    const c = cfg;
    if (!c) return;
    const p = grid.pitch;
    const dist = Math.hypot(ex - sx, ey - sy);
    const hops = clamp(Math.ceil(dist / (3 * p)), 1, 5);
    const path = [sx, sy];
    for (let k = 1; k < hops; k += 1) {
      const fx = sx + ((ex - sx) * k) / hops;
      const fy = sy + ((ey - sy) * k) / hops;
      const inside = fx > 0 && fx < size.w && fy > 0 && fy < size.h;
      if (inside) {
        const h = nearestHole(grid, fx, fy);
        path.push(grid.xy[h * 2] ?? fx, grid.xy[h * 2 + 1] ?? fy);
      } else path.push(fx, fy);
    }
    path.push(ex, ey);
    const speed = clamp(c.hopSpeed, 0.25, 4);
    const at: number[] = [];
    const dur: number[] = [];
    const arc: number[] = [];
    let t = 0;
    for (let k = 0; k + 3 < path.length + 1; k += 2) {
      const ax = path[k] ?? 0;
      const ay = path[k + 1] ?? 0;
      const bx = path[k + 2];
      const by = path[k + 3];
      if (bx === undefined || by === undefined) break;
      const len = Math.hypot(bx - ax, by - ay) / p;
      at.push(t);
      const d = (150 + 34 * Math.min(len, 4)) / speed;
      dur.push(d);
      arc.push(
        p *
          lerp(0.15, 0.6, clamp(c.hopHeight, 0, 1)) *
          (0.6 + Math.min(len, 4) * 0.35),
      );
      t += d + 28 / speed;
    }
    peg.path = path;
    peg.at = at;
    peg.dur = dur;
    peg.arc = arc;
    peg.start = t0 + delay;
    peg.done = false;
  };

  /** Moves the board to `map`, pegs travelling hole to hole from where they are. */
  const migrate = (map: Int8Array, origin: { x: number; y: number }) => {
    const c = cfg;
    if (!c) return;
    const t0 = now();
    evaluate(t0);
    const diag = Math.hypot(size.w, size.h) || 1;
    const spread = clamp(c.spread, 0, 1) * 1100;
    const want = new Int8Array(map);
    const keep: Peg[] = [];
    const free: Peg[][] = [];
    for (const peg of pegs) {
      if (peg.exit) continue;
      if (peg.done && peg.hole >= 0 && want[peg.hole] === peg.color) {
        want[peg.hole] = -2;
        keep.push(peg);
      } else {
        (free[peg.color] ??= []).push(peg);
      }
    }
    // Holes still to fill, nearest the wave's origin first, so the wave
    // takes the nearest peg of each colour as it passes.
    const holes: number[] = [];
    for (let i = 0; i < want.length; i += 1)
      if ((want[i] ?? -1) >= 0) holes.push(i);
    const far = (i: number) =>
      Math.hypot(
        (grid.xy[i * 2] ?? 0) - origin.x,
        (grid.xy[i * 2 + 1] ?? 0) - origin.y,
      );
    holes.sort((a, b) => far(a) - far(b));
    const next: Peg[] = [...keep];
    const jitter = (k: number) => hash2(k, c.seed) * 60;
    for (const hole of holes) {
      const colour = want[hole] ?? 0;
      const list = free[colour];
      const hx = grid.xy[hole * 2] ?? 0;
      const hy = grid.xy[hole * 2 + 1] ?? 0;
      let pick = -1;
      let best = Infinity;
      if (list) {
        for (let k = 0; k < list.length; k += 1) {
          const q = list[k];
          if (!q) continue;
          const d = (q.x - hx) ** 2 + (q.y - hy) ** 2;
          if (d < best) {
            best = d;
            pick = k;
          }
        }
      }
      let peg: Peg;
      let sx: number;
      let sy: number;
      if (pick >= 0 && list) {
        peg = list[pick] as Peg;
        list.splice(pick, 1);
        sx = peg.x;
        sy = peg.y;
      } else {
        // A new peg comes in from the nearer side.
        peg = pegAt(colour, hole);
        sx = hx < size.w / 2 ? -grid.pitch : size.w + grid.pitch;
        sy = hy;
        peg.x = sx;
        peg.y = sy;
      }
      peg.hole = hole;
      peg.exit = false;
      const delay =
        (spread * Math.hypot(sx - origin.x, sy - origin.y)) / diag +
        jitter(hole);
      route(peg, sx, sy, hx, hy, delay, t0);
      next.push(peg);
    }
    // Pegs left over hop off the nearer side.
    for (const list of free) {
      for (const peg of list ?? []) {
        const ex =
          peg.x < size.w / 2 ? -grid.pitch * 1.5 : size.w + grid.pitch * 1.5;
        const delay =
          (spread * Math.hypot(peg.x - origin.x, peg.y - origin.y)) / diag +
          jitter(peg.hole + 7919);
        peg.exit = true;
        peg.hole = -1;
        route(peg, peg.x, peg.y, ex, peg.y, delay, t0);
        next.push(peg);
      }
    }
    pegs = next;
  };

  /** Reduced motion: the old picture fades out where it stands and the new one fades in. */
  const crossfade = (map: Int8Array) => {
    const t0 = now();
    const next: Peg[] = [];
    const taken = new Uint8Array(map.length);
    for (const peg of pegs) {
      if (peg.fade === -1) continue;
      if (peg.hole >= 0 && map[peg.hole] === peg.color) {
        taken[peg.hole] = 1;
        peg.fade = 0;
        next.push(peg);
      } else {
        peg.fade = -1;
        peg.fadeAt = t0;
        peg.done = true;
        next.push(peg);
      }
    }
    for (let i = 0; i < map.length; i += 1) {
      const colour = map[i] ?? -1;
      if (colour < 0 || taken[i]) continue;
      const peg = pegAt(colour, i);
      peg.fade = 1;
      peg.fadeAt = t0;
      next.push(peg);
    }
    pegs = next;
  };

  /* ------------------------------ evaluation ----------------------------- */

  /** Moves every peg to where it is at `t`; returns how many are still travelling. */
  const evaluate = (t: number): number => {
    let moving = 0;
    const survivors: Peg[] = [];
    for (const peg of pegs) {
      if (peg.fade === -1 && t - peg.fadeAt > 320) continue;
      if (peg.fade === 1 && t - peg.fadeAt > 320) peg.fade = 0;
      if (!peg.done) {
        const local = t - peg.start;
        const hops = peg.dur.length;
        let placed = false;
        if (local <= 0) {
          peg.x = peg.path[0] ?? peg.x;
          peg.y = peg.path[1] ?? peg.y;
          peg.lift = 0;
          placed = true;
        }
        for (let k = 0; k < hops && !placed; k += 1) {
          const begin = peg.at[k] ?? 0;
          const d = peg.dur[k] ?? 1;
          if (local < begin) {
            peg.x = peg.path[k * 2] ?? peg.x;
            peg.y = peg.path[k * 2 + 1] ?? peg.y;
            peg.lift = 0;
            placed = true;
          } else if (local < begin + d) {
            const e = (local - begin) / d;
            const ease = 0.5 - 0.5 * Math.cos(Math.PI * e);
            peg.x = lerp(peg.path[k * 2] ?? 0, peg.path[k * 2 + 2] ?? 0, ease);
            peg.y = lerp(
              peg.path[k * 2 + 1] ?? 0,
              peg.path[k * 2 + 3] ?? 0,
              ease,
            );
            peg.lift = 4 * e * (1 - e) * (peg.arc[k] ?? 0);
            placed = true;
          }
        }
        if (!placed) {
          peg.x = peg.path[hops * 2] ?? peg.x;
          peg.y = peg.path[hops * 2 + 1] ?? peg.y;
          peg.lift = 0;
          peg.done = true;
          peg.landedAt =
            peg.start + (peg.at[hops - 1] ?? 0) + (peg.dur[hops - 1] ?? 0);
          lastLanding = t;
          if (peg.exit) continue;
          if (audible) hooks.current.onLand(peg.color, peg.x);
        } else moving += 1;
      }
      survivors.push(peg);
    }
    pegs = survivors;
    return moving;
  };

  /* ------------------------------- drawing ------------------------------- */

  // The recoil spring's squash on landing: two small visible bounces.
  const omega = Math.sqrt(springs.recoil.stiffness / springs.recoil.mass);
  const zeta =
    springs.recoil.damping /
    (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
  const omegaD = omega * Math.sqrt(1 - zeta * zeta);

  const draw = (t: number) => {
    const c = cfg;
    if (!ctx || !c || disposed || size.w < 2) return;
    const s = size.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (boardCanvas) ctx.drawImage(boardCanvas, 0, 0);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const pr = grid.pitch * 0.4;
    const glowAmount = clamp(c.glow, 0, 1);
    const alphaOf = (peg: Peg) =>
      peg.fade === 1
        ? clamp((t - peg.fadeAt) / 300, 0, 1)
        : peg.fade === -1
          ? 1 - clamp((t - peg.fadeAt) / 300, 0, 1)
          : 1;
    // Shadows of lifted pegs, on the board.
    for (const peg of pegs) {
      if (peg.lift <= 0.2) continue;
      const k = Math.min(1, peg.lift / grid.pitch);
      ctx.globalAlpha = 0.4 * k;
      ctx.beginPath();
      ctx.ellipse(
        peg.x + 1.5,
        peg.y + 2,
        pr * (1 - 0.2 * k),
        pr * 0.7,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fill();
    }
    // The light through each seated peg; a lifted peg leaves the light.
    ctx.globalCompositeOperation = "lighter";
    for (const peg of pegs) {
      const sprite = glowSprites[peg.color];
      if (!sprite) continue;
      const k = Math.min(1, peg.lift / Math.max(1, grid.pitch * 0.5));
      const since = t - peg.landedAt;
      const flash = since >= 0 && since < 400 ? Math.exp(-since / 110) : 0;
      const a =
        alphaOf(peg) *
        (0.25 + 0.75 * glowAmount) *
        (1 - 0.85 * k + 0.6 * flash);
      if (a <= 0.01) continue;
      ctx.globalAlpha = Math.min(1, a);
      const half = sprite.width / s / 2;
      ctx.drawImage(
        sprite,
        peg.x - half,
        peg.y - peg.lift - half,
        half * 2,
        half * 2,
      );
    }
    ctx.globalCompositeOperation = "source-over";
    // The pegs: seated first, travelling on top.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const peg of pegs) {
        const lifted = peg.lift > 0.2;
        if ((pass === 0) === lifted) continue;
        const sprite = pegSprites[peg.color];
        if (!sprite) continue;
        const since = (t - peg.landedAt) / 1000;
        const squash =
          since >= 0 && since < 0.7
            ? 0.12 * Math.exp(-zeta * omega * since) * Math.cos(omegaD * since)
            : 0;
        const grow =
          1 + 0.22 * Math.min(1, peg.lift / Math.max(1, grid.pitch * 0.6));
        const half = sprite.width / s / 2;
        const sx = half * grow * (1 + squash * 0.6);
        const sy = half * grow * (1 - squash);
        ctx.globalAlpha = alphaOf(peg) * (lifted ? 0.92 : 1);
        ctx.drawImage(
          sprite,
          peg.x - sx,
          peg.y - peg.lift - sy,
          sx * 2,
          sy * 2,
        );
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /* -------------------------------- loop --------------------------------- */

  const active = (t: number) =>
    pegs.some((p) => !p.done || p.fade !== 0) || t - lastLanding < 700;

  const tick = () => {
    frame = 0;
    if (disposed || !visible.current || document.hidden) return;
    const t = now();
    const moving = evaluate(t);
    draw(t);
    if (moving > 0 || active(t)) frame = window.requestAnimationFrame(tick);
    else hooks.current.onSettle();
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const layout = () => {
    const c = cfg;
    if (!c) return;
    // A narrow board keeps at least 36 holes across, so a four-letter word
    // still reads on a phone; wider boards use the pitch as given.
    grid = gridOf(size.w, size.h, Math.min(c.pitch, Math.max(6, size.w / 36)));
    if (
      picture?.src &&
      sampledFor !== `${picture.src}|${grid.count}|${grid.cols}`
    ) {
      sampled = null;
      sample();
    }
    place(colourMap(grid, picture, sampled));
    paintBoard();
    paintSprites();
  };

  const readColours = () => {
    const kids = carriers.children;
    const list: [number, number, number][] = [];
    for (let i = 0; i < kids.length - 1; i += 1) {
      const el = kids[i];
      if (el) list.push(read(getComputedStyle(el).color));
    }
    palette = list;
    const last = kids[kids.length - 1];
    if (last) boardRgb = read(getComputedStyle(last).color);
    paintBoard();
    paintSprites();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 2 || h < 2) return;
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const changed = w !== size.w || h !== size.h || ratio !== size.scale;
    size.w = w;
    size.h = h;
    size.scale = ratio;
    const cw = Math.max(1, Math.round(w * ratio));
    const ch = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    if (changed) layout();
    draw(now());
  };

  const loadImage = (src: string | undefined) => {
    if (!src) {
      image = null;
      return;
    }
    if (image && image.dataset.src === src) return;
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.dataset.src = src;
    img.onload = () => {
      if (image !== img || disposed) return;
      sample();
      if (picture?.src === src) {
        migrate(colourMap(grid, picture, sampled), {
          x: size.w / 2,
          y: size.h / 2,
        });
        kick();
      }
    };
    img.src = src;
    image = img;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        palette = [];
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.pitch !== next.pitch) layout();
      else if (was.glow !== next.glow) paintSprites();
      if (was.dpr !== next.dpr) resize();
      draw(now());
    },
    resize,
    readColours() {
      readColours();
      draw(now());
    },
    wake() {
      if (pegs.some((p) => !p.done || p.fade !== 0)) kick();
      else draw(now());
    },
    show(next, origin, loud) {
      const c = cfg;
      picture = next;
      audible = loud;
      if (next?.src) loadImage(next.src);
      const map = colourMap(grid, next, next?.src ? sampled : null);
      if (!c || size.w < 2) return;
      if (!origin) place(map);
      else if (!c.motionSafe) crossfade(map);
      else migrate(map, origin);
      draw(now());
      kick();
    },
    size: () => ({ w: size.w, h: size.h }),
    moving: () => pegs.filter((p) => !p.done).length,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (image) image.src = "";
      image = null;
      root.removeAttribute("data-live");
    },
  };
}

/* ------------------------------------------------------------------------ */
/* The server's still: the picture in pegs on a nominal board.               */
/* ------------------------------------------------------------------------ */

function StillBoard({
  picture,
  colors,
  pitch,
}: {
  picture: PegPicture | undefined;
  colors: string[];
  pitch: number;
}) {
  const g = gridOf(720, 240, pitch);
  const map = colourMap(g, picture?.src ? undefined : picture, null);
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < g.count; i += 1) {
    const colour = map[i] ?? -1;
    if (colour < 0) continue;
    dots.push(
      <circle
        key={i}
        cx={r2(g.xy[i * 2] ?? 0)}
        cy={r2(g.xy[i * 2 + 1] ?? 0)}
        r={r2(g.pitch * 0.4)}
        style={{ fill: colors[colour] ?? colors[0] }}
      />,
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 720 240"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      {dots}
    </svg>
  );
}

/**
 * A backlit pegboard: an offset grid of holes in a dark board and, in some
 * of them, translucent coloured pegs glowing with the light behind. The pegs
 * make a picture — a drawn one, a word in a 5 × 7 peg alphabet, or any image
 * reduced to pegs. To change pictures the pegs migrate: pegs already right
 * stay put, the rest are matched to the nearest hole that needs their colour
 * and travel there hole to hole in up to five short arcs, a peg lifted out of
 * its hole leaving the light and casting a shadow, landing with a flash and
 * the springs.recoil squash. Departures are staggered by distance from where
 * you clicked (or the edge an arrow key names), so the board migrates in a
 * wave; spare pegs hop off the nearer side and new ones hop in from it.
 *
 * A click, Enter, Space or Right shows the next picture, Left the previous,
 * Home and End the first and last. Under reduced motion the old picture
 * fades out where it stands and the new one fades in.
 */
export function PegMigration({
  images = defaultPegPictures,
  value,
  defaultValue = 0,
  onValueChange,
  pitch = 13,
  hopSpeed = 1,
  glow = 0.6,
  colors = DEFAULT_COLORS,
  board = "oklch(from var(--ink) 0.2 0.012 h)",
  hopHeight = 0.5,
  spread = 0.5,
  interval = 0,
  seed = 1,
  sound = false,
  dpr = 2,
  label = "Pegboard",
  disabled = false,
  className,
}: PegMigrationProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const count = images.length;
  const last = Math.max(0, count - 1);
  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, last),
  );
  const index = clamp(Math.round(value ?? own), 0, last);
  const pitchPx = clamp(pitch, 9, 21);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const shown = React.useRef(index);
  const pending = React.useRef<{
    origin: { x: number; y: number };
    audible: boolean;
  } | null>(null);
  const held = React.useRef(false);

  const config: Config = {
    pitch: pitchPx,
    hopSpeed,
    glow,
    hopHeight,
    spread,
    seed,
    dpr,
    motionSafe,
    colorKey: `${colors.join("|")}|${board}`,
  };
  const latest = React.useRef(config);
  const picturesRef = React.useRef(images);

  const hooks = React.useRef<Hooks>({
    onLand: () => {},
    onSettle: () => {},
  });
  React.useEffect(() => {
    latest.current = config;
    picturesRef.current = images;
    hooks.current = {
      onLand: (colour, x) => {
        const rect = rootRef.current?.getBoundingClientRect();
        audio.play("tick", {
          pitch: semitones([0, 3, 5, 7, 10, 12, 15][colour % 7] ?? 0),
          gain: 0.22,
          pan: rect ? panFrom(rect.left + x, rootRef.current) : 0,
        });
      },
      onSettle: () => {},
    };
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, hooks);
    engine.current = e;
    e.configure(latest.current);
    e.show(picturesRef.current[shown.current], null, false);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // A new picture — from a click, a key or the host — migrates the board.
  React.useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    const e = engine.current;
    if (!e) return;
    const ask = pending.current;
    pending.current = null;
    const { w, h } = e.size();
    e.show(
      images[index],
      ask?.origin ?? { x: w / 2, y: h / 2 },
      ask?.audible ?? false,
    );
  }, [index, images]);

  // The same picture list re-drawn (a new pitch already re-lays the board).
  const imagesKey = images
    .map((p) => `${p.alt}|${p.src ?? ""}|${p.text ?? ""}`)
    .join("§");
  React.useEffect(() => {
    engine.current?.show(picturesRef.current[shown.current], null, false);
  }, [imagesKey]);

  React.useEffect(() => {
    const onVisibility = () => engine.current?.wake();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const go = (
    to: number,
    origin: { x: number; y: number } | null,
    audible: boolean,
  ) => {
    if (disabled || count < 2) return;
    const next = ((to % count) + count) % count;
    if (next === index) return;
    const size = engine.current?.size() ?? { w: 0, h: 0 };
    pending.current = {
      origin: origin ?? { x: size.w / 2, y: size.h / 2 },
      audible,
    };
    if (audible) audio.play("click", { pitch: 0.9, gain: 0.35 });
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  // Auto-advance: only on screen, in a visible tab, and not while the
  // visitor is pointing at or focused on the board.
  React.useEffect(() => {
    if (!interval || interval < 500 || disabled || count < 2) return;
    const timer = window.setInterval(() => {
      if (!visible.current || document.hidden || held.current) return;
      const size = engine.current?.size() ?? { w: 0, h: 0 };
      pending.current = { origin: { x: 0, y: size.h / 2 }, audible: false };
      const next = (shown.current + 1) % count;
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
    }, interval);
    return () => window.clearInterval(timer);
  }, [interval, disabled, count, value, onValueChange]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const size = engine.current?.size() ?? { w: 0, h: 0 };
    const mid = { x: size.w / 2, y: size.h / 2 };
    const moves: Record<string, [number, { x: number; y: number }]> = {
      ArrowRight: [index + 1, { x: 0, y: size.h / 2 }],
      ArrowLeft: [index - 1, { x: size.w, y: size.h / 2 }],
      Enter: [index + 1, mid],
      " ": [index + 1, mid],
      Home: [0, mid],
      End: [last, mid],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    go(move[0], move[1], true);
  };

  const picture = images[index];

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="pegboard"
      aria-label={`${label}: ${picture?.alt ?? ""}, picture ${index + 1} of ${count}`}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.detail === 0) return;
        const rect = rootRef.current?.getBoundingClientRect();
        go(
          index + 1,
          rect
            ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
            : null,
          true,
        );
      }}
      onPointerEnter={() => {
        held.current = true;
      }}
      onPointerLeave={() => {
        held.current = false;
      }}
      onFocus={() => {
        held.current = true;
      }}
      onBlur={() => {
        held.current = false;
      }}
      className={cn(
        "group/peg-migration relative isolate aspect-[3/1] w-full overflow-clip rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
      style={{
        backgroundColor: board,
        backgroundImage:
          "radial-gradient(circle, oklch(0 0 0 / 0.5) 0 18%, transparent 22%)",
        backgroundSize: `${pitchPx}px ${r2(pitchPx * 0.866)}px`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/peg-migration:hidden"
      >
        <StillBoard picture={picture} colors={colors} pitch={pitchPx} />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/peg-migration:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...colors, board].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <p id={hintId} className="sr-only">
        Click, Enter, Space or Right shows the next picture, Left the previous,
        Home and End the first and last.
      </p>
      {/* The live region reads the picture shown; it changes only when the
          picture does, so each change is announced once. */}
      <p role="status" className="sr-only">
        {picture ? `${picture.alt}, picture ${index + 1} of ${count}.` : ""}
      </p>
    </div>
  );
}
