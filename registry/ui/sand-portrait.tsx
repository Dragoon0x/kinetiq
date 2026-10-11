"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SandPortraitItem = {
  /** A picture to pour. Same-origin or CORS-enabled; without one, a drawn print is used. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** A short title, spoken with the slide. Defaults to `alt`. */
  caption?: string;
};

export type SandPortraitState = "still" | "sweeping" | "settling" | "swirling";

export type SandPortraitProps = {
  /** The pictures, poured one at a time. @default defaultSandPortraits */
  items?: SandPortraitItem[];
  /** Controlled: the picture shown. */
  value?: number;
  /** Initial picture when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the tap or key that asked for another picture, with its index. */
  onValueChange?: (index: number) => void;
  /** How many grains make the picture, 600 (a coarse mosaic) to 8000 (fine sand). @default 3200 */
  grains?: number;
  /** How wide and how hard a sweep catches the sand, 0 (a fingertip) to 1 (a palm). @default 0.6 */
  sweep?: number;
  /** How quickly the picture rebuilds, 0.25 (lingers) to 2.5 (snaps back). @default 1 */
  reform?: number;
  /** How much returning grains curl on their way home, 0 (straight) to 1. @default 0.5 */
  curl?: number;
  /** How many turns the spiral's arms wind when the picture changes, 0.5 to 3. @default 1.6 */
  swirl?: number;
  /** Grain-to-grain variation in tone, 0 (flat colour) to 1 (coarse, mixed sand). @default 0.5 */
  texture?: number;
  /** How long the sand waits after a stroke stops before it flows back, ms. @default 220 */
  hold?: number;
  /** The tray: a sand-coloured floor and a shaded rim. Off, the grains lie on whatever is behind. @default true */
  tray?: boolean;
  /** Sweeping with the pointer and tapping for the next picture. Keys always work. @default true */
  interactive?: boolean;
  /** Hold every grain where it is. @default false */
  paused?: boolean;
  /** Seeds the grain grid and its tones, so two trays never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Height of the tray, px. @default 300 */
  height?: number;
  /** The tray's accessible name. @default "Sand picture" */
  label?: string;
  /** Fires when the sand starts or stops moving: sweeping, settling back, swirling, or still. */
  onStateChange?: (state: SandPortraitState) => void;
  /** No sweeps, taps or keys; the tray dims. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- prints -------------------------------- */

/** Scenes are composed in a 3:2 space and cover-fitted, so any box crops them evenly. */
const SW = 150;
const SH = 100;

type Paint = string | { from: string; to: string; y0: number; y1: number };
type Shape = { d: string; fill: Paint; opacity?: number };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

const rect = (x: number, y: number, w: number, h: number) =>
  `M${r3(x)} ${r3(y)}h${r3(w)}v${r3(h)}h${r3(-w)}Z`;
const ellipse = (cx: number, cy: number, rx: number, ry = rx) =>
  `M${r3(cx - rx)} ${r3(cy)}a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(2 * rx)} 0a${r3(rx)} ${r3(ry)} 0 1 0 ${r3(-2 * rx)} 0Z`;
const poly = (pts: readonly number[]) => {
  let d = "";
  for (let i = 0; i + 1 < pts.length; i += 2) {
    d += `${i === 0 ? "M" : "L"}${r3(pts[i] ?? 0)} ${r3(pts[i + 1] ?? 0)}`;
  }
  return `${d}Z`;
};
/** A soft ridge through the points (midpoint quadratics), closed down to `base`. */
const ridge = (pts: readonly number[], base = SH) => {
  const n = Math.floor(pts.length / 2);
  const x = (i: number) => r3(pts[i * 2] ?? 0);
  const y = (i: number) => r3(pts[i * 2 + 1] ?? 0);
  let d = `M${x(0)} ${base}L${x(0)} ${y(0)}`;
  for (let i = 1; i < n - 1; i += 1) {
    d += `Q${x(i)} ${y(i)} ${r3((x(i) + x(i + 1)) / 2)} ${r3((y(i) + y(i + 1)) / 2)}`;
  }
  d += `L${x(n - 1)} ${y(n - 1)}L${x(n - 1)} ${base}Z`;
  return d;
};

const SCENES: readonly (readonly Shape[])[] = [
  // Dusk over the dunes.
  [
    {
      d: rect(0, 0, SW, SH),
      fill: {
        from: pig("--accent", 0.46, 0.1, 28),
        to: pig("--warn", 0.86, 0.1, -22),
        y0: 0,
        y1: 64,
      },
    },
    {
      d: ellipse(104, 50, 13),
      fill: pig("--warn", 0.9, 0.11, -12),
      opacity: 0.35,
    },
    { d: ellipse(104, 50, 8.5), fill: pig("--warn", 0.95, 0.1, -6) },
    {
      d: ridge([0, 60, 22, 54, 46, 60, 74, 51, 104, 59, 128, 52, 150, 57]),
      fill: pig("--danger", 0.56, 0.1, 22),
    },
    {
      d: ridge([0, 72, 26, 64, 54, 73, 86, 62, 116, 70, 150, 64]),
      fill: pig("--warn", 0.66, 0.12, -28),
    },
    {
      d: poly([86, 62, 99, 70, 70, 100, 52, 100]),
      fill: pig("--danger", 0.48, 0.09, 26),
      opacity: 0.55,
    },
    {
      d: ridge([0, 86, 30, 77, 66, 84, 104, 75, 150, 82]),
      fill: pig("--warn", 0.78, 0.11, -18),
    },
    {
      d: poly([104, 75, 122, 80, 108, 100, 92, 100]),
      fill: pig("--warn", 0.62, 0.11, -26),
      opacity: 0.6,
    },
  ],
  // Lighthouse on the point.
  [
    {
      d: rect(0, 0, SW, SH),
      fill: {
        from: pig("--accent", 0.6, 0.1, -22),
        to: pig("--accent", 0.9, 0.035, -32),
        y0: 0,
        y1: 60,
      },
    },
    {
      d: poly([113, 20.5, 36, 9, 36, 31]),
      fill: pig("--warn", 0.97, 0.05),
      opacity: 0.26,
    },
    { d: rect(0, 58, SW, 42), fill: pig("--accent", 0.48, 0.11, -12) },
    { d: rect(0, 63, 96, 2.4), fill: pig("--accent", 0.62, 0.09, -14) },
    { d: rect(0, 71, 84, 3), fill: pig("--accent", 0.6, 0.09, -14) },
    { d: rect(0, 82, 70, 3.6), fill: pig("--accent", 0.58, 0.09, -14) },
    {
      d: ridge([68, 100, 82, 70, 96, 60, 112, 57, 132, 59, 150, 62]),
      fill: pig("--success", 0.62, 0.11, -48),
    },
    {
      d: ridge([74, 100, 86, 78, 98, 70, 114, 68, 134, 70, 150, 73]),
      fill: pig("--ink-2", 0.4, 0.02),
    },
    {
      d: poly([111, 58, 114.5, 24, 121.5, 24, 125, 58]),
      fill: pig("--accent", 0.97, 0.008),
    },
    {
      d: poly([112.6, 42, 113.4, 34.5, 122.6, 34.5, 123.4, 42]),
      fill: pig("--danger", 0.56, 0.17),
    },
    { d: rect(113, 17, 10, 7), fill: pig("--warn", 0.88, 0.13) },
    {
      d: poly([111, 17.5, 118, 11, 125, 17.5]),
      fill: pig("--danger", 0.42, 0.12),
    },
  ],
  // Pear on the sill.
  [
    {
      d: rect(0, 0, SW, SH),
      fill: {
        from: pig("--warn", 0.88, 0.035, -30),
        to: pig("--warn", 0.76, 0.05, -34),
        y0: 0,
        y1: 66,
      },
    },
    { d: rect(16, 8, 50, 50), fill: pig("--warn", 0.95, 0.04, -12) },
    { d: rect(39.5, 8, 4, 50), fill: pig("--warn", 0.8, 0.04, -30) },
    { d: rect(16, 31, 50, 4), fill: pig("--warn", 0.8, 0.04, -30) },
    {
      d: poly([66, 8, 92, 30, 92, 66, 66, 58]),
      fill: pig("--warn", 0.9, 0.04, -16),
      opacity: 0.55,
    },
    { d: rect(0, 66, SW, 34), fill: pig("--danger", 0.5, 0.08, 40) },
    { d: rect(0, 66, SW, 3.5), fill: pig("--danger", 0.64, 0.08, 40) },
    { d: rect(0, 80, SW, 1.6), fill: pig("--danger", 0.42, 0.07, 40) },
    { d: ellipse(94, 67.5, 18, 3), fill: pig("--danger", 0.34, 0.05, 40) },
    { d: ellipse(119, 67.5, 10, 2.2), fill: pig("--danger", 0.34, 0.05, 40) },
    {
      d: "M84 34C79 34 77 40 78 46C71 50 72 66 86 67C100 67 101 51 93 46C93 40 90 34 84 34Z",
      fill: pig("--success", 0.76, 0.14, -58),
    },
    { d: ellipse(80.5, 54, 3, 6), fill: pig("--success", 0.88, 0.11, -60) },
    { d: rect(83.4, 28, 1.8, 7), fill: pig("--danger", 0.36, 0.06, 40) },
    { d: ellipse(89, 31, 5, 2.2), fill: pig("--success", 0.55, 0.12, -10) },
    { d: ellipse(116, 59, 8.5), fill: pig("--accent", 0.42, 0.13, 72) },
    { d: ellipse(113, 56, 2.2), fill: pig("--accent", 0.6, 0.1, 72) },
  ],
  // Night ferry.
  [
    {
      d: rect(0, 0, SW, SH),
      fill: {
        from: pig("--accent", 0.22, 0.06),
        to: pig("--accent", 0.4, 0.08, 14),
        y0: 0,
        y1: 62,
      },
    },
    { d: ellipse(40, 24, 11), fill: pig("--warn", 0.9, 0.05), opacity: 0.18 },
    { d: ellipse(40, 24, 7), fill: pig("--warn", 0.94, 0.05) },
    { d: ellipse(18, 12, 1.3), fill: pig("--warn", 0.92, 0.03) },
    { d: ellipse(70, 8, 1.2), fill: pig("--warn", 0.92, 0.03) },
    { d: ellipse(128, 16, 1.4), fill: pig("--warn", 0.92, 0.03) },
    { d: ellipse(98, 28, 1.1), fill: pig("--warn", 0.92, 0.03) },
    {
      d: ridge([0, 60, 20, 55, 44, 58, 70, 52, 96, 57, 124, 53, 150, 58], 64),
      fill: pig("--accent", 0.18, 0.04),
    },
    { d: rect(0, 62, SW, 38), fill: pig("--accent", 0.28, 0.07) },
    { d: rect(34, 66, 12, 1.6), fill: pig("--warn", 0.86, 0.05), opacity: 0.8 },
    {
      d: rect(31, 72, 18, 1.8),
      fill: pig("--warn", 0.82, 0.05),
      opacity: 0.65,
    },
    { d: rect(28, 80, 24, 2), fill: pig("--warn", 0.8, 0.05), opacity: 0.5 },
    { d: rect(30, 90, 20, 2), fill: pig("--warn", 0.78, 0.05), opacity: 0.35 },
    {
      d: poly([76, 70, 130, 70, 123, 79, 83, 79]),
      fill: pig("--accent", 0.93, 0.015),
    },
    { d: rect(88, 61, 28, 9), fill: pig("--accent", 0.84, 0.02) },
    { d: rect(91, 63.5, 22, 2.6), fill: pig("--warn", 0.86, 0.15) },
    { d: rect(105, 53, 5, 8), fill: pig("--danger", 0.55, 0.16) },
    { d: rect(86, 84, 34, 2), fill: pig("--warn", 0.7, 0.12), opacity: 0.55 },
    { d: rect(92, 89, 22, 1.6), fill: pig("--warn", 0.66, 0.1), opacity: 0.4 },
  ],
];

export const defaultSandPortraits: SandPortraitItem[] = [
  {
    alt: "Dusk over the dunes: a low sun between rust and ochre ridges",
    caption: "Dusk over the dunes",
  },
  {
    alt: "A white lighthouse with a red band on a grassy point above the sea",
    caption: "Lighthouse on the point",
  },
  {
    alt: "A green pear and a plum on a wooden sill under a bright window",
    caption: "Pear on the sill",
  },
  {
    alt: "A lit ferry crossing dark water under the moon",
    caption: "Night ferry",
  },
];

/* ---------------------------------- engine -------------------------------- */

const STEP = 1 / 120;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const mod = (a: number, n: number) => ((a % n) + n) % n;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// The return spring is drift's, per unit mass; the swirl's pull is glide's.
const RETURN_K = springs.drift.stiffness / springs.drift.mass;
const RETURN_C = springs.drift.damping / springs.drift.mass;
const GATHER_K = springs.glide.stiffness / springs.glide.mass;
const GATHER_C = springs.glide.damping / springs.glide.mass;
/** A thrown eddy decays like a hand on a heavy surface: the distance `project` gives. */
const EDDY_DECAY = 1000 / Math.max(1, project(0, 1000, 0.992));

type Config = {
  grains: number;
  sweep: number;
  reform: number;
  curl: number;
  swirl: number;
  texture: number;
  hold: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  index: number;
  /** Per item: its source, or a drawn scene. */
  sources: readonly (string | undefined)[];
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  wake: () => void;
  readColours: () => void;
  /** Swirl into another picture; dir 1 turns forward, -1 back. */
  show: (index: number, dir: number) => void;
  sweepAt: (x: number, y: number, t: number, start: boolean) => void;
  release: (vx: number, vy: number) => void;
  dispose: () => void;
};

type Picture = { data: Uint8ClampedArray; w: number; h: number };

/**
 * The sand outside React: a jittered grid of homes, grains with positions,
 * velocities and colours in typed arrays, and one ImageData the grains are
 * stamped into each frame.
 */
function createSand(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  probe: HTMLSpanElement,
  visible: { current: boolean },
  report: (state: SandPortraitState) => void,
): Engine {
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let live = false;
  let shown = -1;
  const size = { w: 0, h: 0, dpr: 1 };

  // Grid.
  let n = 0;
  let spacing = 4;
  let cellX = new Float32Array(0);
  let cellY = new Float32Array(0);
  /** Cells sorted from the centre outward (the spiral's order). */
  let cellOrder = new Int32Array(0);
  // Grains.
  let cell = new Int32Array(0);
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  /** 0 home, 1 loose, 2 returning, 3 swirling. */
  let mode = new Uint8Array(0);
  /** Seconds until a returning grain sets off, or a swirling one is released. */
  let wait = new Float32Array(0);
  let tone = new Float32Array(0);
  let curlSign = new Float32Array(0);
  let dim = new Float32Array(0);
  let slot = new Float32Array(0);
  let scatter = new Float32Array(0);
  let cr = new Float32Array(0);
  let cg = new Float32Array(0);
  let cb = new Float32Array(0);
  let tr = new Float32Array(0);
  let tg = new Float32Array(0);
  let tb = new Float32Array(0);
  /** Reduced motion: seconds before a grain's colour starts to change. */
  let hue = new Float32Array(0);
  let order = new Int32Array(0);
  let dist = new Float32Array(0);

  // Drawing.
  let image: ImageData | null = null;
  let buf: Uint32Array | null = null;
  let stampX = new Int16Array(0);
  let stampY = new Int16Array(0);
  let stampShade = new Float32Array(0);

  // The eddy under the hand.
  const eddy = {
    on: false,
    alive: false,
    x: 0,
    y: 0,
    ux: 0,
    uy: 0,
    turn: 1,
    /** When the last move event arrived: clock seconds, and its event time in ms. */
    at: 0,
    t: 0,
  };
  const swirl = { on: false, t: 0, dir: 1, unwind: 1, span: 1.8, angle: 0 };
  let clock = 0;
  let lastActive = -1;
  let pendingReform = false;
  let state: SandPortraitState = "still";

  // Pictures, keyed by item index, rebuilt on resize and theme change.
  const pictures = new Map<number, Picture>();
  const images = new Map<string, HTMLImageElement | "loading" | "failed">();
  const paths = new Map<string, Path2D>();
  const colours = new Map<string, string>();
  let probeCtx: CanvasRenderingContext2D | null = null;

  const resolve = (colour: string): string => {
    const hit = colours.get(colour);
    if (hit) return hit;
    if (!probeCtx) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      probeCtx = c.getContext("2d", { willReadFrequently: true });
    }
    let out = "rgb(0, 0, 0)";
    if (probeCtx) {
      probe.style.color = colour;
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = "rgb(0, 0, 0)";
      probeCtx.fillStyle = getComputedStyle(probe).color;
      probeCtx.fillRect(0, 0, 1, 1);
      const d = probeCtx.getImageData(0, 0, 1, 1).data;
      out = `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
    }
    colours.set(colour, out);
    return out;
  };

  const pathOf = (d: string) => {
    let p = paths.get(d);
    if (!p) {
      p = new Path2D(d);
      paths.set(d, p);
    }
    return p;
  };

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    scene: readonly Shape[],
  ) => {
    const { w, h } = size;
    const s = Math.max(w / SW, h / SH);
    ctx.setTransform(s, 0, 0, s, (w - SW * s) / 2, (h - SH * s) / 2);
    for (const shape of scene) {
      const f = shape.fill;
      if (typeof f === "string") {
        ctx.fillStyle = resolve(f);
      } else {
        const g = ctx.createLinearGradient(0, f.y0, 0, f.y1);
        g.addColorStop(0, resolve(f.from));
        g.addColorStop(1, resolve(f.to));
        ctx.fillStyle = g;
      }
      ctx.globalAlpha = shape.opacity ?? 1;
      ctx.fill(pathOf(shape.d));
    }
    ctx.globalAlpha = 1;
  };

  /** The picture for an item, drawn at the box's size; a source still loading uses its drawn print. */
  const picture = (index: number): Picture | null => {
    const c = cfg;
    const { w, h } = size;
    if (!c || w < 1 || h < 1) return null;
    const hit = pictures.get(index);
    if (hit && hit.w === w && hit.h === h) return hit;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const src = c.sources[index];
    const img = src ? images.get(src) : undefined;
    if (src && img === undefined) load(src);
    const scene = SCENES[mod(index, SCENES.length)] ?? [];
    let data: Uint8ClampedArray | null = null;
    if (img instanceof HTMLImageElement) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      ctx.drawImage(
        img,
        (w - img.naturalWidth * s) / 2,
        (h - img.naturalHeight * s) / 2,
        img.naturalWidth * s,
        img.naturalHeight * s,
      );
      try {
        data = ctx.getImageData(0, 0, w, h).data;
      } catch {
        // A source without CORS taints the canvas: pour the drawn print instead.
        if (src) images.set(src, "failed");
        ctx.clearRect(0, 0, w, h);
      }
    }
    if (!data) {
      drawScene(ctx, scene);
      data = ctx.getImageData(0, 0, w, h).data;
    }
    const pic = { data, w, h };
    // A source on its way is not cached, so it is drawn for real on arrival.
    if (!src || images.get(src) !== "loading") pictures.set(index, pic);
    return pic;
  };

  const load = (src: string) => {
    images.set(src, "loading");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (disposed) return;
      images.set(src, img);
      pictures.clear();
      if (cfg?.sources[shown] === src) retarget(false);
    };
    img.onerror = () => {
      if (disposed) return;
      images.set(src, "failed");
      pictures.clear();
    };
    img.src = src;
  };

  /** The target colour of every grain, from the picture at its home cell. */
  const retarget = (instant: boolean) => {
    const pic = picture(shown);
    if (!pic) return;
    const { data, w, h } = pic;
    for (let i = 0; i < n; i += 1) {
      const j = cell[i] ?? 0;
      const x = clamp(Math.round(cellX[j] ?? 0), 0, w - 1);
      const y = clamp(Math.round(cellY[j] ?? 0), 0, h - 1);
      const o = (y * w + x) * 4;
      const a = (data[o + 3] ?? 255) / 255;
      // Transparent pixels in a source pour as a pale sand.
      tr[i] = (data[o] ?? 0) * a + 214 * (1 - a);
      tg[i] = (data[o + 1] ?? 0) * a + 196 * (1 - a);
      tb[i] = (data[o + 2] ?? 0) * a + 160 * (1 - a);
      if (instant) {
        cr[i] = tr[i] ?? 0;
        cg[i] = tg[i] ?? 0;
        cb[i] = tb[i] ?? 0;
      }
    }
    kick();
  };

  /** The grid of homes for this box and grain count, and every grain at home. */
  const build = () => {
    const c = cfg;
    const { w, h } = size;
    if (!c || w < 1 || h < 1) return;
    const target = clamp(Math.round(c.grains), 200, 12000);
    spacing = Math.sqrt((w * h) / target);
    const cols = Math.max(1, Math.round(w / spacing));
    const rows = Math.max(1, Math.round(h / spacing));
    const sx = w / cols;
    const sy = h / rows;
    spacing = (sx + sy) / 2;
    n = cols * rows;
    cellX = new Float32Array(n);
    cellY = new Float32Array(n);
    cell = new Int32Array(n);
    px = new Float32Array(n);
    py = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    mode = new Uint8Array(n);
    wait = new Float32Array(n);
    tone = new Float32Array(n);
    curlSign = new Float32Array(n);
    dim = new Float32Array(n);
    slot = new Float32Array(n);
    scatter = new Float32Array(n * 2);
    cr = new Float32Array(n);
    cg = new Float32Array(n);
    cb = new Float32Array(n);
    tr = new Float32Array(n);
    tg = new Float32Array(n);
    tb = new Float32Array(n);
    hue = new Float32Array(n);
    order = new Int32Array(n);
    dist = new Float32Array(n);
    const rand = lcg(c.seed * 31 + 7);
    const phase = rand() * 6.283;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        cellX[k] = (i + 0.5 + (rand() - 0.5) * 0.42) * sx;
        cellY[k] = (j + 0.5 + (rand() - 0.5) * 0.42) * sy;
      }
    }
    for (let k = 0; k < n; k += 1) {
      cell[k] = k;
      px[k] = cellX[k] ?? 0;
      py[k] = cellY[k] ?? 0;
      tone[k] = rand();
      // A smooth field of curl, so neighbours curl the same way.
      const fx = (cellX[k] ?? 0) / Math.max(1, w);
      const fy = (cellY[k] ?? 0) / Math.max(1, h);
      // Held to ±1: the curl's gain then stays under the return spring's
      // damping, so a grain spirals in and never out.
      curlSign[k] =
        (Math.sin(fx * 5.1 + phase) + 0.8 * Math.cos(fy * 4.3 - phase * 0.7)) /
        1.8;
      scatter[k * 2] = rand() - 0.5;
      scatter[k * 2 + 1] = rand() - 0.5;
    }
    // Centre-out order of the cells, measured in the swirl's own ellipse.
    const cx = w / 2;
    const cy = h / 2;
    const ex = clamp(w / h, 1, 1.5);
    const cd = new Float32Array(n);
    for (let k = 0; k < n; k += 1) {
      const dx = ((cellX[k] ?? 0) - cx) / ex;
      const dy = (cellY[k] ?? 0) - cy;
      cd[k] = dx * dx + dy * dy;
    }
    const idx = Array.from({ length: n }, (_, k) => k);
    idx.sort((a, b) => (cd[a] ?? 0) - (cd[b] ?? 0));
    cellOrder = Int32Array.from(idx);
    swirl.on = false;
    eddy.on = false;
    eddy.alive = false;
    pendingReform = false;
    stamp();
    pictures.clear();
    retarget(true);
  };

  /** The bead: a disc lit from the upper left, as pixel offsets and shades. */
  const stamp = () => {
    const rd = Math.max(0.6, spacing * 0.7 * size.dpr);
    const R = Math.ceil(rd);
    const xs: number[] = [];
    const ys: number[] = [];
    const ss: number[] = [];
    for (let dy = -R; dy <= R; dy += 1) {
      for (let dx = -R; dx <= R; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d > rd + 0.2) continue;
        const lit = rd < 1.5 ? 0 : -(dx + dy) / (rd * 1.414);
        const shade = clamp(1 + 0.16 * lit - 0.14 * (d / rd) ** 2, 0.7, 1.2);
        xs.push(dx);
        ys.push(dy);
        ss.push(shade);
      }
    }
    stampX = Int16Array.from(xs);
    stampY = Int16Array.from(ys);
    stampShade = Float32Array.from(ss);
  };

  const draw = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx || !visible.current || size.w < 1) return;
    const bw = canvas.width;
    const bh = canvas.height;
    if (!image || image.width !== bw || image.height !== bh) {
      image = ctx.createImageData(bw, bh);
      buf = new Uint32Array(image.data.buffer);
    }
    const out = buf;
    if (!out) return;
    out.fill(0);
    const dpr = size.dpr;
    const texture = clamp01(cfg?.texture ?? 0.5);
    const m = stampX.length;
    // Resting grains first, loose ones over them: a swept grain rides on top.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < n; i += 1) {
        const loose = (mode[i] ?? 0) !== 0;
        if (loose !== (pass === 1)) continue;
        const gx = Math.round((px[i] ?? 0) * dpr);
        const gy = Math.round((py[i] ?? 0) * dpr);
        const k =
          (1 + ((tone[i] ?? 0.5) - 0.5) * 0.26 * texture) *
          (1 - (dim[i] ?? 0) * 0.42) *
          (loose ? 1.05 : 1);
        const r = (cr[i] ?? 0) * k;
        const g = (cg[i] ?? 0) * k;
        const b = (cb[i] ?? 0) * k;
        for (let s = 0; s < m; s += 1) {
          const x = gx + (stampX[s] ?? 0);
          const y = gy + (stampY[s] ?? 0);
          if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
          const f = stampShade[s] ?? 1;
          const rr = Math.min(255, r * f) | 0;
          const gg = Math.min(255, g * f) | 0;
          const bb = Math.min(255, b * f) | 0;
          out[y * bw + x] = (0xff000000 | (bb << 16) | (gg << 8) | rr) >>> 0;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  const setState = (next: SandPortraitState) => {
    if (next === state) return;
    state = next;
    report(next);
  };

  /** One fixed step of the sand. Returns whether anything is still moving. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    clock += dt;
    const { w, h } = size;
    let busy = false;
    const reform = clamp(c.reform, 0.25, 2.5);
    const reach = Math.min(w, h) * (0.07 + 0.17 * clamp01(c.sweep));
    const reach2 = reach * reach;

    // The eddy: under the hand, or thrown on after it lets go.
    if (eddy.alive) {
      busy = true;
      if (eddy.on) {
        // No new move events means the hand has stopped.
        const quiet = clock - eddy.at;
        if (quiet > 0.03) {
          const k = Math.exp(-dt * 14);
          eddy.ux *= k;
          eddy.uy *= k;
        }
      } else {
        eddy.x += eddy.ux * dt;
        eddy.y += eddy.uy * dt;
        const k = Math.exp(-dt * EDDY_DECAY);
        eddy.ux *= k;
        eddy.uy *= k;
        if (eddy.x < 0 || eddy.x > w) eddy.ux *= -0.4;
        if (eddy.y < 0 || eddy.y > h) eddy.uy *= -0.4;
        eddy.x = clamp(eddy.x, 0, w);
        eddy.y = clamp(eddy.y, 0, h);
        if (Math.hypot(eddy.ux, eddy.uy) < 24) eddy.alive = false;
      }
      if (Math.hypot(eddy.ux, eddy.uy) > 30) lastActive = clock;
    }

    const speed = Math.hypot(eddy.ux, eddy.uy);
    // Under reduced motion the hand moves nothing; it only marks the sand.
    const pushing = c.motionSafe && eddy.alive && speed > 6;
    const pull = 10 + 22 * clamp01(c.sweep);
    const core = reach * 0.38;

    // The stroke has stopped: the loose sand starts back, grain by grain.
    if (
      pendingReform &&
      !(eddy.alive && speed > 30) &&
      clock - lastActive > c.hold / 1000
    ) {
      pendingReform = false;
      const rand = lcg(c.seed * 977 + Math.round(clock * 60));
      for (let i = 0; i < n; i += 1) {
        if ((mode[i] ?? 0) !== 1) continue;
        mode[i] = 2;
        const fromBottom = 1 - (cellY[cell[i] ?? 0] ?? 0) / Math.max(1, h);
        wait[i] = ((fromBottom * 0.85 + rand() * 0.3) * 1.1) / reform;
      }
    }

    const k = RETURN_K * reform * reform;
    const cdamp = RETURN_C * reform;
    const curlGain = clamp01(c.curl) * 1.25;
    const friction = Math.exp(-dt * 6.5);

    if (swirl.on) {
      swirl.t += dt;
      busy = true;
    }
    // The spiral turns up to speed, holds, and eases off as it unwinds.
    const spin = swirl.on
      ? 2.6 *
        Math.min(1, swirl.t / 0.45) *
        Math.pow(clamp01(1 - (swirl.t - swirl.unwind) / swirl.span), 1.6)
      : 0;
    const rot = swirl.dir * spin;
    const cx = w / 2;
    const cy = h / 2;
    const ex = clamp(w / h, 1, 1.5);
    const rmax = Math.min(w, h) * 0.44;
    const turns = clamp(c.swirl, 0.5, 3) * Math.PI * 2;
    let anyLoose = false;
    let anySwirl = false;

    for (let i = 0; i < n; i += 1) {
      let md = mode[i] ?? 0;
      let x = px[i] ?? 0;
      let y = py[i] ?? 0;
      let ux = vx[i] ?? 0;
      let uy = vy[i] ?? 0;

      if (pushing && md !== 3) {
        const dx = x - eddy.x;
        const dy = y - eddy.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach2) {
          const d = Math.sqrt(d2) || 0.001;
          let f = 1 - d / reach;
          f *= f;
          // A Rankine vortex riding the stroke: solid turn inside the core,
          // falling off outside it, plus a pull along and a little inward.
          const tangent =
            speed * 0.75 * eddy.turn * (d < core ? d / core : core / d);
          const tx =
            eddy.ux * 0.85 - (dy / d) * tangent - (dx / d) * speed * 0.22;
          const ty =
            eddy.uy * 0.85 + (dx / d) * tangent - (dy / d) * speed * 0.22;
          const blend = 1 - Math.exp(-dt * pull * f * 3);
          // A grain at home only lifts once the stroke really moves it.
          if (md === 1 || blend * speed > 1.5) {
            ux += (tx - ux) * blend;
            uy += (ty - uy) * blend;
            if (md !== 1) {
              md = 1;
              wait[i] = 0;
            }
            pendingReform = true;
          }
        }
      }

      if (md === 1) {
        ux *= friction;
        uy *= friction;
        x += ux * dt;
        y += uy * dt;
        anyLoose = true;
      } else if (md === 2) {
        const wt = wait[i] ?? 0;
        if (wt > 0) {
          wait[i] = wt - dt;
          ux *= friction;
          uy *= friction;
          x += ux * dt;
          y += uy * dt;
        } else {
          const j = cell[i] ?? 0;
          const ex2 = (cellX[j] ?? 0) - x;
          const ey2 = (cellY[j] ?? 0) - y;
          const away = Math.hypot(ex2, ey2);
          // Curl fades near home, so a grain slots in instead of orbiting.
          const turn =
            k *
            curlGain *
            (curlSign[i] ?? 0) *
            Math.min(1, away / (spacing * 5));
          const ax = k * ex2 - cdamp * ux - ey2 * turn;
          const ay = k * ey2 - cdamp * uy + ex2 * turn;
          ux += ax * dt;
          uy += ay * dt;
          x += ux * dt;
          y += uy * dt;
          if (away < 0.3 && ux * ux + uy * uy < 16) {
            x = cellX[j] ?? x;
            y = cellY[j] ?? y;
            ux = 0;
            uy = 0;
            md = 0;
          }
        }
        anyLoose = true;
      } else if (md === 3) {
        anySwirl = true;
        const wt = wait[i] ?? 0;
        if (swirl.t >= wt) {
          if (swirl.t > swirl.unwind + (1 - (slot[i] ?? 0)) * swirl.span) {
            // Peels off the arm with the speed it had: the spiral unwinds.
            md = 2;
            wait[i] = 0;
          } else {
            const u = slot[i] ?? 0;
            const su = Math.sqrt(u);
            const arm = (Math.floor(u * n) % 2) * Math.PI;
            const r =
              rmax * (0.06 + 0.94 * su) +
              (scatter[i * 2 + 1] ?? 0) * spacing * 2.2;
            const a =
              swirl.angle +
              arm +
              swirl.dir * turns * su +
              ((scatter[i * 2] ?? 0) * 0.9) / (1 + su * 6);
            const tx = cx + Math.cos(a) * r * ex;
            const ty = cy + Math.sin(a) * r;
            ux += (GATHER_K * (tx - x) - GATHER_C * ux) * dt;
            uy += (GATHER_K * (ty - y) - GATHER_C * uy) * dt;
          }
          x += ux * dt;
          y += uy * dt;
        }
        // Colour turns toward the next picture while the grain turns.
        const blend = 1 - Math.exp(-dt * 2.4);
        cr[i] = (cr[i] ?? 0) + ((tr[i] ?? 0) - (cr[i] ?? 0)) * blend;
        cg[i] = (cg[i] ?? 0) + ((tg[i] ?? 0) - (cg[i] ?? 0)) * blend;
        cb[i] = (cb[i] ?? 0) + ((tb[i] ?? 0) - (cb[i] ?? 0)) * blend;
      }

      // The tray's walls.
      if (x < 0) {
        x = 0;
        ux = Math.abs(ux) * 0.3;
      } else if (x > w) {
        x = w;
        ux = -Math.abs(ux) * 0.3;
      }
      if (y < 0) {
        y = 0;
        uy = Math.abs(uy) * 0.3;
      } else if (y > h) {
        y = h;
        uy = -Math.abs(uy) * 0.3;
      }

      mode[i] = md;
      px[i] = x;
      py[i] = y;
      vx[i] = ux;
      vy[i] = uy;
    }

    if (swirl.on) {
      swirl.angle += rot * dt;
      if (!anySwirl && swirl.t > swirl.unwind) swirl.on = false;
    }

    // Colours settle toward their targets (a late source, a theme change,
    // or reduced motion's grain-by-grain cross-fade).
    let anyColour = false;
    const rate = c.motionSafe ? 6 : 9;
    const blend = 1 - Math.exp(-dt * rate);
    for (let i = 0; i < n; i += 1) {
      if ((mode[i] ?? 0) === 3) continue;
      const hw = hue[i] ?? 0;
      if (hw > 0) {
        hue[i] = hw - dt;
        anyColour = true;
        continue;
      }
      const dr = (tr[i] ?? 0) - (cr[i] ?? 0);
      const dg = (tg[i] ?? 0) - (cg[i] ?? 0);
      const db = (tb[i] ?? 0) - (cb[i] ?? 0);
      if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 1.5) {
        cr[i] = tr[i] ?? 0;
        cg[i] = tg[i] ?? 0;
        cb[i] = tb[i] ?? 0;
        continue;
      }
      anyColour = true;
      cr[i] = (cr[i] ?? 0) + dr * blend;
      cg[i] = (cg[i] ?? 0) + dg * blend;
      cb[i] = (cb[i] ?? 0) + db * blend;
    }

    // Reduced motion's touch: a dimmed trail that fades back.
    let anyDim = false;
    if (!c.motionSafe && eddy.on) {
      for (let i = 0; i < n; i += 1) {
        const dx = (px[i] ?? 0) - eddy.x;
        const dy = (py[i] ?? 0) - eddy.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach2) {
          dim[i] = Math.max(dim[i] ?? 0, 1 - Math.sqrt(d2) / reach);
        }
      }
    }
    for (let i = 0; i < n; i += 1) {
      const dm = dim[i] ?? 0;
      if (dm <= 0) continue;
      dim[i] = Math.max(0, dm - dt * 1.4);
      anyDim = true;
    }

    setState(
      swirl.on
        ? "swirling"
        : eddy.alive
          ? "sweeping"
          : anyLoose
            ? "settling"
            : "still",
    );
    return busy || anyLoose || anySwirl || anyColour || anyDim || pendingReform;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c) return;
    if (!visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let more = true;
    if (!c.paused) {
      carry += dt;
      let steps = 0;
      while (carry >= STEP && steps < 8) {
        carry -= STEP;
        steps += 1;
        more = step(STEP);
      }
    }
    draw();
    if (more && !c.paused) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !cfg) return;
    if (!visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    image = null;
    build();
    draw();
  };

  const show = (index: number, dir: number) => {
    const c = cfg;
    if (!c) return;
    if (index === shown && !swirl.on) return;
    shown = index;
    if (n === 0) return;
    if (!c.motionSafe) {
      // A cross-fade in place, bottom up, grain by grain.
      for (let i = 0; i < n; i += 1) {
        const fromBottom = 1 - (cellY[cell[i] ?? 0] ?? 0) / Math.max(1, size.h);
        hue[i] = fromBottom * 0.3;
      }
      retarget(false);
      return;
    }
    // Grains rank by how far they are from the centre now; cells rank the
    // same way in the next picture. The nth grain takes the nth arm slot and
    // the nth cell, so the outside of the spiral becomes the picture's edge.
    const cx = size.w / 2;
    const cy = size.h / 2;
    const ex = clamp(size.w / size.h, 1, 1.5);
    for (let i = 0; i < n; i += 1) {
      const dx = ((px[i] ?? 0) - cx) / ex;
      const dy = (py[i] ?? 0) - cy;
      dist[i] = dx * dx + dy * dy;
      order[i] = i;
    }
    order.sort((a, b) => (dist[a] ?? 0) - (dist[b] ?? 0));
    const speed = 0.6 + 0.4 * clamp(c.reform, 0.25, 2.5);
    swirl.on = true;
    swirl.t = 0;
    swirl.dir = dir >= 0 ? 1 : -1;
    swirl.unwind = 1 / speed;
    swirl.span = 1.8 / speed;
    for (let q = 0; q < n; q += 1) {
      const i = order[q] ?? 0;
      cell[i] = cellOrder[q] ?? i;
      slot[i] = (q + 0.5) / n;
      mode[i] = 3;
      // The outside joins last, inside the 600 ms beat.
      wait[i] = (q / n) * 0.35;
      hue[i] = 0;
    }
    eddy.alive = false;
    eddy.on = false;
    pendingReform = false;
    retarget(false);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        shown = next.index;
        resize();
        return;
      }
      const sourcesChanged =
        was.sources.length !== next.sources.length ||
        was.sources.some((s, i) => s !== next.sources[i]);
      if (sourcesChanged) pictures.clear();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      } else if (was.grains !== next.grains || was.seed !== next.seed) {
        build();
      } else if (sourcesChanged) {
        retarget(false);
      }
      if (next.index !== shown) {
        // A host's change turns the short way round.
        const count = Math.max(1, next.sources.length);
        show(next.index, mod(next.index - shown, count) <= count / 2 ? 1 : -1);
      }
      draw();
      kick();
    },
    resize,
    wake() {
      draw();
      kick();
    },
    readColours() {
      colours.clear();
      pictures.clear();
      retarget(true);
      draw();
    },
    show(index, dir) {
      show(index, dir);
      kick();
    },
    sweepAt(x, y, t, start) {
      const c = cfg;
      if (!c) return;
      if (start || !eddy.on) {
        eddy.on = true;
        eddy.alive = true;
        eddy.x = x;
        eddy.y = y;
        eddy.ux = 0;
        eddy.uy = 0;
        eddy.at = clock;
        eddy.t = t;
        kick();
        return;
      }
      const dt = Math.max(0.004, (t - eddy.t) / 1000);
      const ix = (x - eddy.x) / dt;
      const iy = (y - eddy.y) / dt;
      // The eddy turns the way the stroke curves.
      const cross = eddy.ux * iy - eddy.uy * ix;
      const bend = Math.abs(cross) > 1e3 ? Math.sign(cross) : 0;
      if (bend) eddy.turn += (bend - eddy.turn) * 0.25;
      eddy.ux = eddy.ux * 0.55 + ix * 0.45;
      eddy.uy = eddy.uy * 0.55 + iy * 0.45;
      eddy.x = x;
      eddy.y = y;
      eddy.t = t;
      eddy.at = clock;
      kick();
    },
    release(ux, uy) {
      if (!eddy.on) return;
      eddy.on = false;
      const c = cfg;
      if (!c || !c.motionSafe) {
        eddy.alive = false;
        kick();
        return;
      }
      eddy.ux = clamp(ux, -2400, 2400);
      eddy.uy = clamp(uy, -2400, 2400);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* ------------------------------- component ------------------------------- */

/**
 * A picture laid in coloured sand. Every grain has a home and a colour taken
 * from the picture there, a tone of its own and a bead's highlight, and is
 * stamped straight into the canvas each frame, resting grains first and loose
 * ones on top.
 *
 * Drag through it and an eddy rides the stroke: a small vortex that drags the
 * grains along and turns them the way the stroke curves, leaving a curling
 * wake; a flick throws the eddy on. When the stroke stops, the sand flows home
 * grain by grain from the bottom up, each on its own spring with the
 * springs.drift constants and a sideways curl, so the picture rebuilds in
 * curling streams. A tap swirls every grain into a turning two-armed spiral on
 * springs.glide constants while their colours turn toward the next picture,
 * then the spiral slowly unwinds from the outside in, each grain peeling off
 * to its place in the new picture. Right, Enter and Space swirl forward, Left
 * back, Home and End to the ends. Under reduced motion a sweep leaves a dimmed
 * trail that fades, and a new picture cross-fades into the grains in place.
 */
export function SandPortrait({
  items = defaultSandPortraits,
  value,
  defaultValue = 0,
  onValueChange,
  grains = 3200,
  sweep = 0.6,
  reform = 1,
  curl = 0.5,
  swirl = 1.6,
  texture = 0.5,
  hold = 220,
  tray = true,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  height = 300,
  label = "Sand picture",
  onStateChange,
  disabled = false,
  className,
}: SandPortraitProps) {
  const motionSafe = useMotionSafe();
  const list = items.length > 0 ? items : defaultSandPortraits;
  const M = list.length;
  const hintId = React.useId();
  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), M));
  const current = value === undefined ? own : mod(Math.round(value), M);
  const [said, setSaid] = React.useState("");
  const live = interactive && !disabled;
  const item = list[current];

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const heading = React.useRef(current);
  const report = React.useRef(onStateChange);

  const sources = React.useMemo(() => list.map((it) => it.src), [list]);
  const config: Config = {
    grains,
    sweep,
    reform,
    curl,
    swirl,
    texture,
    hold,
    paused,
    seed,
    dpr,
    motionSafe,
    index: current,
    sources,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onStateChange;
    latest.current = config;
    heading.current = current;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const probe = probeRef.current;
    if (!root || !canvas || !probe) return;
    const e = createSand(root, canvas, probe, visible, (s) =>
      report.current?.(s),
    );
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** Another picture, from a tap or a key: the swirl, the value, the words. */
  const go = (index: number, dir: number) => {
    const next = mod(index, M);
    if (next === heading.current) return;
    heading.current = next;
    const it = list[next];
    setSaid(`${it?.caption ?? it?.alt ?? ""}, ${next + 1} of ${M}.`);
    engine.current?.show(next, dir);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return {
      x: clientX - (rect?.left ?? 0),
      y: clientY - (rect?.top ?? 0),
    };
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !live,
    onStart: ({ point, event }) => {
      const p = local(point.x, point.y);
      engine.current?.sweepAt(p.x, p.y, event.timeStamp, true);
    },
    onMove: ({ point, event }) => {
      const p = local(point.x, point.y);
      engine.current?.sweepAt(p.x, p.y, event.timeStamp, false);
    },
    onEnd: ({ velocity }) => engine.current?.release(velocity.x, velocity.y),
    onCancel: () => engine.current?.release(0, 0),
    onTap: () => go(heading.current + 1, 1),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const at = heading.current;
    let next: number | null = null;
    let dir = 1;
    if (
      event.key === "ArrowRight" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      next = at + 1;
    } else if (event.key === "ArrowLeft") {
      next = at - 1;
      dir = -1;
    } else if (event.key === "Home") {
      next = 0;
      dir = -1;
    } else if (event.key === "End") {
      next = M - 1;
    }
    if (next === null) return;
    event.preventDefault();
    if (event.repeat && (event.key === "Enter" || event.key === " ")) return;
    go(next, dir);
  };

  const caption = item?.caption ?? item?.alt ?? "";

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/sand-portrait relative isolate w-full overflow-clip rounded-4 outline-none select-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        live
          ? "cursor-grab touch-none active:cursor-grabbing"
          : "cursor-default",
        disabled && "opacity-60",
        className,
      )}
      style={{ height }}
    >
      {tray ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor:
              "color-mix(in oklab, oklch(from var(--warn) 0.58 0.06 h) 55%, var(--card))",
          }}
        />
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-500 group-data-live/sand-portrait:invisible group-data-live/sand-portrait:opacity-0"
      >
        <StillPrint
          item={item}
          index={current}
          grains={grains}
          height={height}
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {tray ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] border border-hairline-strong"
          style={{
            boxShadow:
              "inset 0 1px 3px oklch(0 0 0 / 0.22), inset 0 -1px 0 oklch(1 0 0 / 0.08)",
          }}
        />
      ) : null}
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${current + 1} of ${M}: ${caption}`}
        className="sr-only"
      >
        {item?.alt}
      </div>
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      <p id={hintId} className="sr-only">
        Sweep through the sand and it flows back into the picture. Right, Enter
        or Space swirls it into the next picture, Left into the previous one;
        Home and End go to the first and last.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the print
 * itself in SVG under a fine screen of grain shadows.
 */
function StillPrint({
  item,
  index,
  grains,
  height,
}: {
  item: SandPortraitItem | undefined;
  index: number;
  grains: number;
  height: number;
}) {
  const gid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const scene = SCENES[mod(index, SCENES.length)] ?? [];
  // About the grain pitch at a typical width, so the screen reads as sand.
  const pitch = r3(
    clamp(Math.sqrt((Math.max(240, height * 1.4) * height) / grains), 2, 12),
  );
  return (
    <div className="absolute inset-0">
      {item?.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt=""
          draggable={false}
          className="block size-full object-cover"
        />
      ) : (
        <svg
          viewBox={`0 0 ${SW} ${SH}`}
          preserveAspectRatio="xMidYMid slice"
          className="block size-full"
        >
          <defs>
            {scene.map((shape, k) =>
              typeof shape.fill === "string" ? null : (
                <linearGradient
                  key={k}
                  id={`${gid}-${k}`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  x2="0"
                  y1={shape.fill.y0}
                  y2={shape.fill.y1}
                >
                  <stop offset="0" style={{ stopColor: shape.fill.from }} />
                  <stop offset="1" style={{ stopColor: shape.fill.to }} />
                </linearGradient>
              ),
            )}
          </defs>
          {scene.map((shape, k) => (
            <path
              key={k}
              d={shape.d}
              opacity={shape.opacity}
              style={{
                fill:
                  typeof shape.fill === "string"
                    ? shape.fill
                    : `url(#${gid}-${k})`,
              }}
            />
          ))}
        </svg>
      )}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 38% 38%, oklch(1 0 0 / 0.16), transparent 34%, transparent 58%, oklch(0 0 0 / 0.16) 72%)",
          backgroundSize: `${pitch}px ${pitch}px`,
        }}
      />
    </div>
  );
}
