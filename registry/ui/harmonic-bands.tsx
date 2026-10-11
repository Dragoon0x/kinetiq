"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type HarmonicBandsPalette = "dusk" | "tide" | "ember" | "moss";

export type HarmonicBandsProps = {
  /** How many harmonics shape the wave, and so how many faders sit beneath it, 2 to 6. @default 4 */
  harmonics?: number;
  /** The colours the bands are drawn from, pale to deep: a preset, or two to eight CSS colours of your own. @default "dusk" */
  palette?: HarmonicBandsPalette | string[];
  /** How fast the waves travel across the frame, 0 (held still) to 2. @default 1 */
  flow?: number;
  /** Controlled level of each harmonic, 0 to 1, fundamental first. */
  value?: number[];
  /** Initial levels when uncontrolled. @default [1, 0.45, 0.2, 0.1, 0.06, 0.03] */
  defaultValue?: number[];
  /** Fires from the fader or key that changed a level, with every level. */
  onValueChange?: (value: number[]) => void;
  /** How many strata of colour are stacked, 3 to 8. @default 5 */
  bands?: number;
  /** How tall the crests stand, 0 (flat strata) to 1 (crests reaching the band above). @default 0.6 */
  amplitude?: number;
  /** How many waves of the fundamental span the frame, 0.5 to 3. @default 1.25 */
  cycles?: number;
  /** 0 moves the whole shape rigidly; 1 lets every harmonic run at its own deep-water speed, so the shape keeps re-forming. @default 0.4 */
  dispersion?: number;
  /** How far each lower band trails the one above, in phase and in the morph's cascade, 0 to 1. @default 0.35 */
  lag?: number;
  /** The sheen on each crest and the shading toward each band's foot, 0 (flat pigment) to 1. @default 0.5 */
  sheen?: number;
  /** Show the row of faders beneath the bands. Off, it is a display driven by `value`. @default true */
  controls?: boolean;
  /** The fader row's accessible name. @default "Harmonics" */
  label?: string;
  /** Hold the waves still. @default false */
  paused?: boolean;
  /** Seeds each harmonic's starting phase. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The faders stop answering (they stay focusable and say so). @default false */
  disabled?: boolean;
  /** Sizes the panel. @default "h-56 w-full" */
  className?: string;
};

const MAX_HARMONICS = 6;
const MAX_BANDS = 8;
const DEFAULT_LEVELS = [1, 0.45, 0.2, 0.1, 0.06, 0.03];
const NAMES = [
  "Fundamental",
  "Second harmonic",
  "Third harmonic",
  "Fourth harmonic",
  "Fifth harmonic",
  "Sixth harmonic",
];
const SHORT = ["f", "2f", "3f", "4f", "5f", "6f"];

/**
 * Pigment, not text colour: each stop takes a token's hue at a fixed
 * lightness, so the strata look the same on a light page and a dark one.
 */
const PALETTES: Record<HarmonicBandsPalette, string[]> = {
  dusk: [
    "oklch(from var(--accent-bright) 0.9 0.04 calc(h + 70))",
    "oklch(from var(--accent-bright) 0.8 0.09 calc(h + 45))",
    "oklch(from var(--accent-bright) 0.68 0.14 calc(h + 15))",
    "oklch(from var(--accent-bright) 0.55 0.17 h)",
    "oklch(from var(--accent-bright) 0.42 0.14 calc(h - 12))",
  ],
  tide: [
    "oklch(from var(--signal) 0.93 0.04 calc(h + 30))",
    "oklch(from var(--signal) 0.83 0.08 calc(h + 20))",
    "oklch(from var(--signal) 0.7 0.1 calc(h + 30))",
    "oklch(from var(--signal) 0.56 0.1 calc(h + 55))",
    "oklch(from var(--signal) 0.43 0.09 calc(h + 80))",
  ],
  ember: [
    "oklch(from var(--warn) 0.94 0.05 calc(h + 12))",
    "oklch(from var(--warn) 0.85 0.11 h)",
    "oklch(from var(--warn) 0.74 0.15 calc(h - 25))",
    "oklch(from var(--warn) 0.61 0.17 calc(h - 48))",
    "oklch(from var(--warn) 0.48 0.15 calc(h - 62))",
  ],
  moss: [
    "oklch(from var(--success) 0.93 0.04 calc(h - 45))",
    "oklch(from var(--success) 0.83 0.07 calc(h - 32))",
    "oklch(from var(--success) 0.71 0.09 calc(h - 20))",
    "oklch(from var(--success) 0.58 0.08 calc(h - 8))",
    "oklch(from var(--success) 0.45 0.06 h)",
  ],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(seed: number, i: number): number {
  let h =
    Math.imul((seed | 0) + 0x632be5ab, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const stopsOf = (palette: HarmonicBandsPalette | string[]): string[] => {
  if (Array.isArray(palette)) {
    const own = palette.filter((c) => typeof c === "string" && c.trim());
    if (own.length >= 2) return own.slice(0, 8);
    if (own.length === 1) return [own[0] as string, own[0] as string];
    return PALETTES.dusk;
  }
  return PALETTES[palette] ?? PALETTES.dusk;
};

/** A point along the palette as a CSS colour, mixed in oklab like the canvas mixes it. */
function mixAt(stops: string[], p: number): string {
  const seg = clamp(p, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const t = seg - i;
  const a = stops[i] ?? stops[0] ?? "currentColor";
  const b = stops[i + 1] ?? a;
  const pa = Math.round((1 - t) * 100);
  if (pa >= 100) return a;
  if (pa <= 0) return b;
  return `color-mix(in oklab, ${a} ${pa}%, ${b})`;
}

/** Where harmonic j's own colour sits on the palette: pale fundamental, deep top harmonic. */
const harmonicSpot = (j: number, n: number) =>
  0.08 + (0.84 * j) / Math.max(1, n - 1);

/** The spectral centroid, 0 (fundamental alone) to 1 (top harmonic alone). */
function centroid(levels: ArrayLike<number>, offset: number, n: number) {
  let sum = 0;
  let weighted = 0;
  for (let j = 0; j < n; j += 1) {
    const a = Math.max(0, levels[offset + j] ?? 0);
    sum += a;
    weighted += a * (j / Math.max(1, n - 1));
  }
  return sum > 1e-4 ? weighted / sum : 0;
}

/** Where band b of B sits on the palette for a centroid c. */
const bandSpot = (b: number, count: number, c: number) =>
  clamp((b / Math.max(1, count - 1)) * 0.66 + c * 0.34, 0, 1);

// ── colour maths: the canvas mixes in oklab, as the still's color-mix does ──

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toGamma = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

function rgbToOklab(
  r: number,
  g: number,
  b: number,
  out: Float32Array,
  at: number,
) {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  out[at] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[at + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[at + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}

/** An oklab colour as a packed 0xRRGGBB integer. */
function oklabToPacked(L: number, A: number, B: number): number {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  const r = toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  const R = Math.round(clamp(r, 0, 1) * 255);
  const G = Math.round(clamp(g, 0, 1) * 255);
  const Bl = Math.round(clamp(b, 0, 1) * 255);
  return (R << 16) | (G << 8) | Bl;
}

const packedCss = (p: number) =>
  `rgb(${(p >> 16) & 255}, ${(p >> 8) & 255}, ${p & 255})`;

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.6, 0.6, 0.7];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

// ── the wave ──

type Shape = {
  harmonics: number;
  bands: number;
  amplitude: number;
  cycles: number;
  dispersion: number;
  lag: number;
  seed: number;
};

/** The geometry every frame shares: band baselines, crest height, lag. */
function frame(w: number, h: number, s: Shape) {
  const top = h * 0.1;
  const gap = (h - top) / s.bands;
  const k1 = (Math.PI * 2 * s.cycles) / Math.max(1, w);
  return {
    top,
    gap,
    k1,
    base: (b: number) => top + gap * (b + 0.5),
    crest: (b: number) => s.amplitude * gap * 1.2 * (1 - 0.05 * b),
    lagPx: (b: number) => (b * s.lag * w * 0.14) / s.cycles,
  };
}

/** Angular speed of harmonic n (1-based): rigid at dispersion 0, deep water at 1. */
const omega = (n: number, dispersion: number) =>
  0.7 * Math.pow(n, 1 - 0.5 * dispersion);

/** The seeded phase of harmonic n. */
const phaseOf = (seed: number, n: number) => hash(seed, n) * Math.PI * 2;

// ── the engine ──

type Config = Shape & {
  flow: number;
  sheen: number;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
  stops: number;
};

type Engine = {
  configure: (cfg: Config) => void;
  retarget: (levels: number[]) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  dispose: () => void;
};

const HISTORY = 64;

function createEngine(
  root: HTMLElement,
  host: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let frameId = 0;
  let last = 0;
  let clock = 0;
  let tau = 0;
  let disposed = false;
  const size = { w: 0, h: 0, ratio: 1 };
  const read = rgbReader();

  // Palette stops in oklab.
  const lab = new Float32Array(8 * 3);
  let stopCount = 0;

  // Springing amplitudes per band and harmonic, with their velocities.
  const amp = new Float32Array(MAX_BANDS * MAX_HARMONICS);
  const vel = new Float32Array(MAX_BANDS * MAX_HARMONICS);
  const goal = new Float32Array(MAX_BANDS * MAX_HARMONICS);
  // A short history of targets, so each band can take the target the band
  // above took a beat earlier: the cascade, under a moving finger too.
  const histT = new Float64Array(HISTORY);
  const histV = new Float32Array(HISTORY * MAX_HARMONICS);
  let histHead = 0;
  let histCount = 0;
  let lastPush = -Infinity;
  const latest = new Float32Array(MAX_HARMONICS);
  let seeded = false;

  // One wave's samples, reused by every band.
  let ys = new Float32Array(0);
  // Gradients are rebuilt only when a band's colours or geometry change.
  const fillKey = new Float64Array(MAX_BANDS).fill(-1);
  const shadeKey = new Float64Array(MAX_BANDS).fill(-1);
  const fills: (CanvasGradient | null)[] = new Array(MAX_BANDS).fill(null);
  const shades: (CanvasGradient | null)[] = new Array(MAX_BANDS).fill(null);
  let sheenKey = -1;
  let sheenStroke = "rgba(255, 255, 255, 0.3)";
  let shadowKey = -1;
  let shadowColour = "rgba(0, 0, 0, 0.12)";

  const delay = () => {
    const c = cfg;
    if (!c) return 0;
    return Math.min(
      cascade(c.bands) * (0.5 + c.lag),
      0.55 / Math.max(1, c.bands - 1),
    );
  };

  const push = (time: number) => {
    histT[histHead] = time;
    for (let j = 0; j < MAX_HARMONICS; j += 1)
      histV[histHead * MAX_HARMONICS + j] = latest[j] ?? 0;
    histHead = (histHead + 1) % HISTORY;
    histCount = Math.min(HISTORY, histCount + 1);
    lastPush = time;
  };

  /** Writes into `goal` the target band b should be heading for at `time`. */
  const targetFor = (b: number, time: number) => {
    let pick = -1;
    for (let k = 1; k <= histCount; k += 1) {
      const i = (histHead - k + HISTORY) % HISTORY;
      pick = i;
      if ((histT[i] ?? 0) <= time) break;
    }
    for (let j = 0; j < MAX_HARMONICS; j += 1) {
      goal[b * MAX_HARMONICS + j] =
        pick < 0 ? (latest[j] ?? 0) : (histV[pick * MAX_HARMONICS + j] ?? 0);
    }
  };

  const settled = () => {
    const c = cfg;
    if (!c) return true;
    if (clock - lastPush < delay() * (c.bands - 1) + 0.02) return false;
    for (let b = 0; b < c.bands; b += 1) {
      for (let j = 0; j < c.harmonics; j += 1) {
        const i = b * MAX_HARMONICS + j;
        if (Math.abs((amp[i] ?? 0) - (latest[j] ?? 0)) > 4e-4) return false;
        if (Math.abs(vel[i] ?? 0) > 4e-3) return false;
      }
    }
    return true;
  };

  const snapAll = () => {
    for (let b = 0; b < MAX_BANDS; b += 1) {
      for (let j = 0; j < MAX_HARMONICS; j += 1) {
        amp[b * MAX_HARMONICS + j] = latest[j] ?? 0;
        vel[b * MAX_HARMONICS + j] = 0;
      }
    }
  };

  /** One step of the glide spring for every band, sub-stepped for stability. */
  const integrate = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const k = springs.glide.stiffness / springs.glide.mass;
    const damp = springs.glide.damping / springs.glide.mass;
    const step = delay();
    for (let b = 0; b < c.bands; b += 1) targetFor(b, clock - b * step);
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      left -= h;
      for (let b = 0; b < c.bands; b += 1) {
        for (let j = 0; j < c.harmonics; j += 1) {
          const i = b * MAX_HARMONICS + j;
          const x = amp[i] as number;
          const v = vel[i] as number;
          const nv = v + (k * ((goal[i] as number) - x) - damp * v) * h;
          vel[i] = nv;
          amp[i] = x + nv * h;
        }
      }
    }
  };

  const sample = (stopsAt: number) => {
    // The palette at p, in oklab, packed to 8-bit sRGB.
    const n = Math.max(1, stopCount);
    const seg = clamp(stopsAt, 0, 1) * (n - 1);
    const i = Math.min(Math.max(0, n - 2), Math.floor(seg));
    const t = n > 1 ? seg - i : 0;
    const j = Math.min(n - 1, i + 1);
    const L = (lab[i * 3] ?? 0) * (1 - t) + (lab[j * 3] ?? 0) * t;
    const A = (lab[i * 3 + 1] ?? 0) * (1 - t) + (lab[j * 3 + 1] ?? 0) * t;
    const B = (lab[i * 3 + 2] ?? 0) * (1 - t) + (lab[j * 3 + 2] ?? 0) * t;
    return oklabToPacked(L, A, B);
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || size.w < 1 || size.h < 1) return;
    const w = size.w;
    const h = size.h;
    const f = frame(w, h, c);
    ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const samples = ys.length - 1;
    const sheen = clamp(c.sheen, 0, 1);
    const sk = Math.round(sheen * 100);
    if (sk !== sheenKey) {
      sheenKey = sk;
      sheenStroke = `rgba(255, 255, 255, ${r2(0.18 + sheen * 0.5)})`;
    }
    if (sk !== shadowKey) {
      shadowKey = sk;
      shadowColour = `rgba(10, 12, 24, ${r2(0.06 + sheen * 0.16)})`;
    }

    for (let b = 0; b < c.bands; b += 1) {
      const off = b * MAX_HARMONICS;
      let sum = 0;
      for (let j = 0; j < c.harmonics; j += 1)
        sum += Math.abs(amp[off + j] as number);
      const norm = 1 / Math.max(1, sum);
      const base = f.base(b);
      const crest = f.crest(b) * norm;
      const lagPx = f.lagPx(b);
      for (let i = 0; i <= samples; i += 1) {
        const x = (i / samples) * w - lagPx;
        let y = 0;
        for (let j = 0; j < c.harmonics; j += 1) {
          const n = j + 1;
          y +=
            (amp[off + j] as number) *
            Math.sin(
              f.k1 * n * x - omega(n, c.dispersion) * tau + phaseOf(c.seed, n),
            );
        }
        ys[i] = base - crest * y;
      }

      // Colour slides along the palette with this band's own spectrum.
      const spot = bandSpot(b, c.bands, centroid(amp, off, c.harmonics));
      const left = sample(spot - 0.07);
      const right = sample(spot + 0.07);
      const key = left * 16777216 + right;
      if (fillKey[b] !== key || !fills[b]) {
        fillKey[b] = key;
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, packedCss(left));
        g.addColorStop(1, packedCss(right));
        fills[b] = g;
      }
      const top = base - f.crest(b);
      const shade = Math.round(top) * 4096 + Math.round(f.gap) + sk * 1e-3;
      if (shadeKey[b] !== shade || !shades[b]) {
        shadeKey[b] = shade;
        const g = ctx.createLinearGradient(0, top, 0, base + f.gap * 1.4);
        g.addColorStop(0, `rgba(255, 255, 255, ${r2(sheen * 0.12)})`);
        g.addColorStop(0.4, "rgba(255, 255, 255, 0)");
        g.addColorStop(1, `rgba(8, 10, 22, ${r2(0.04 + sheen * 0.16)})`);
        shades[b] = g;
      }

      ctx.beginPath();
      ctx.moveTo(0, ys[0] ?? base);
      for (let i = 1; i <= samples; i += 1)
        ctx.lineTo((i / samples) * w, ys[i] ?? base);
      ctx.lineTo(w, h + 2);
      ctx.lineTo(0, h + 2);
      ctx.closePath();
      // Each band casts a soft shadow up onto the one behind it: the depth
      // that makes a stack of flat pigment read as layers.
      if (b > 0) {
        ctx.shadowColor = shadowColour;
        ctx.shadowBlur = 12 * size.ratio;
        ctx.shadowOffsetY = -1.5 * size.ratio;
      }
      ctx.fillStyle = fills[b] as CanvasGradient;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = shades[b] as CanvasGradient;
      ctx.fill();

      if (sheen > 0.01) {
        ctx.beginPath();
        ctx.moveTo(0, ys[0] ?? base);
        for (let i = 1; i <= samples; i += 1)
          ctx.lineTo((i / samples) * w, ys[i] ?? base);
        ctx.strokeStyle = sheenStroke;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const moving = () => {
    const c = cfg;
    if (!c || !c.motionSafe) return false;
    if (!c.paused && c.flow > 0) return true;
    return !settled();
  };

  const tick = (now: number) => {
    frameId = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    if (c.motionSafe) {
      if (!c.paused) tau += dt * clamp(c.flow, 0, 2);
      integrate(dt);
    }
    draw();
    if (moving()) frameId = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frameId || !visible.current || document.hidden) return;
    if (!moving()) {
      draw();
      return;
    }
    frameId = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    stopCount = Math.min(8, kids.length);
    for (let i = 0; i < stopCount; i += 1) {
      const el = kids[i];
      if (!el) continue;
      const [r, g, b] = read(getComputedStyle(el).color);
      rgbToOklab(r, g, b, lab, i * 3);
    }
    fillKey.fill(-1);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    size.w = w;
    size.h = h;
    size.ratio = ratio;
    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const samples = clamp(Math.round(w / 3), 48, 260);
    if (ys.length !== samples + 1) ys = new Float32Array(samples + 1);
    fillKey.fill(-1);
    shadeKey.fill(-1);
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        resize();
        return;
      }
      // Called after every render: a render that changed nothing here (a
      // fader drag re-rendering the panel) costs nothing.
      let same = true;
      for (const key of Object.keys(next) as (keyof Config)[]) {
        if (was[key] !== next[key]) {
          same = false;
          break;
        }
      }
      if (same) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey || was.stops !== next.stops)
        readColours();
      if (
        was.amplitude !== next.amplitude ||
        was.bands !== next.bands ||
        was.cycles !== next.cycles
      )
        shadeKey.fill(-1);
      if (!next.motionSafe) {
        tau = 0;
        snapAll();
      }
      draw();
      kick();
    },
    retarget(levels) {
      let changed = !seeded;
      for (let j = 0; j < MAX_HARMONICS; j += 1) {
        const v = clamp(levels[j] ?? 0, 0, 1);
        if (Math.abs((latest[j] ?? 0) - v) > 1e-6) changed = true;
        latest[j] = v;
      }
      if (!seeded) {
        // The first chord is where the still already is: no morph from flat.
        seeded = true;
        snapAll();
        push(clock - 10);
      } else if (changed) {
        push(clock);
      }
      if (!cfg?.motionSafe) snapAll();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      root.removeAttribute("data-live");
    },
  };
}

// ── the still: the server's frame and the first paint ──

const STILL_W = 760;
const STILL_H = 150;

function stillBands(levels: number[], shape: Shape, stops: string[]) {
  const f = frame(STILL_W, STILL_H, shape);
  const n = shape.harmonics;
  let sum = 0;
  for (let j = 0; j < n; j += 1) sum += Math.abs(levels[j] ?? 0);
  const norm = 1 / Math.max(1, sum);
  const c = centroid(levels, 0, n);
  const samples = 96;
  return Array.from({ length: shape.bands }, (_, b) => {
    const base = f.base(b);
    const crest = f.crest(b) * norm;
    const pts: string[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const x = (i / samples) * STILL_W;
      let y = 0;
      for (let j = 0; j < n; j += 1) {
        const k = j + 1;
        y +=
          (levels[j] ?? 0) *
          Math.sin(f.k1 * k * (x - f.lagPx(b)) + phaseOf(shape.seed, k));
      }
      pts.push(`${r2(x)} ${r2(base - crest * y)}`);
    }
    const edge = `M ${pts.join(" L ")}`;
    return {
      b,
      edge,
      fill: `${edge} L ${STILL_W} ${STILL_H + 2} L 0 ${STILL_H + 2} Z`,
      colour: mixAt(stops, bandSpot(b, shape.bands, c)),
    };
  });
}

// ── a fader ──

type FaderProps = {
  index: number;
  level: number;
  colour: string;
  disabled: boolean;
  motionSafe: boolean;
  onLevel: (index: number, level: number) => void;
};

/** A sine of frequency n across the glyph, as tall as the level. */
function glyphPath(n: number, level: number): string {
  const amp = 0.8 + clamp(level, -0.2, 1.25) * 4.6;
  const pts: string[] = [];
  const steps = 36;
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * 28 + 2;
    const y = 7 - amp * Math.sin((i / steps) * Math.PI * 2 * n);
    pts.push(`${r2(x)} ${r2(y)}`);
  }
  return `M ${pts.join(" L ")}`;
}

function Fader({
  index,
  level,
  colour,
  disabled,
  motionSafe,
  onLevel,
}: FaderProps) {
  const chipRef = React.useRef<HTMLSpanElement | null>(null);
  const shown = useMotionValue(level);
  const press = useMotionValue(1);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const aimed = React.useRef(level);
  const dragging = React.useRef(false);
  const start = React.useRef(0);
  const span = React.useRef(40);

  const settle = React.useCallback(
    (to: number, velocity = 0) => {
      running.current?.stop();
      aimed.current = to;
      running.current = motionSafe
        ? animate(shown, to, { ...springs.snap, velocity })
        : animate(shown, to, { duration: durations.fast, ease: easings.enter });
    },
    [motionSafe, shown],
  );

  // A level that arrives from outside (a host, another key) is settled to on
  // snap; one the drag is still holding is left to the finger. Running every
  // render also returns a refused drag to the level the host kept.
  React.useEffect(() => {
    if (dragging.current) return;
    if (Math.abs(aimed.current - level) < 1e-4) return;
    settle(level);
  });

  React.useEffect(() => () => running.current?.stop(), []);

  const commit = (next: number, velocity = 0) => {
    const v = r2(clamp(next, 0, 1));
    settle(v, velocity);
    if (Math.abs(v - level) > 1e-4) onLevel(index, v);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      running.current?.stop();
      start.current = shown.get();
      span.current = Math.max(24, (chipRef.current?.clientHeight ?? 36) - 4);
    },
    onMove: ({ offset }) => {
      const raw = start.current - offset.y / span.current;
      const shownLevel =
        raw < 0
          ? rubberband(raw, 1)
          : raw > 1
            ? 1 + rubberband(raw - 1, 1)
            : raw;
      shown.set(r3(shownLevel));
      const v = r2(clamp(raw, 0, 1));
      if (Math.abs(v - level) > 1e-4) onLevel(index, v);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = r2(clamp(shown.get(), 0, 1));
      settle(v, -velocity.y / span.current);
      if (Math.abs(v - level) > 1e-4) onLevel(index, v);
    },
    onCancel: () => {
      dragging.current = false;
      settle(level);
    },
    onTap: (event) => {
      const el = chipRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      commit(1 - (event.clientY - r.top - 2) / Math.max(1, r.height - 4));
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 0.2 : 0.05;
    let next: number | null = null;
    if (event.key === "ArrowUp" || event.key === "ArrowRight")
      next = level + step;
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft")
      next = level - step;
    else if (event.key === "PageUp") next = level + 0.25;
    else if (event.key === "PageDown") next = level - 0.25;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    if (next === null) return;
    event.preventDefault();
    commit(next);
  };

  const fill = useTransform(shown, (v) => `${r2(clamp(v, 0, 1) * 100)}%`);
  // Pulled past either end the chip itself gives, from the end it is held at.
  const stretch = useTransform(shown, (v) =>
    r3(1 + Math.max(0, v - 1) * 0.3 + Math.max(0, -v) * 0.3),
  );
  const origin = useTransform(shown, (v) => (v < 0 ? 0 : 1));
  const path = useTransform(shown, (v) => glyphPath(index + 1, v));
  const pct = Math.round(clamp(level, 0, 1) * 100);
  const name = NAMES[index] ?? `Harmonic ${index + 1}`;

  return (
    <motion.div
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${name}, ${pct}%`}
      aria-disabled={disabled || undefined}
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        if (disabled || !motionSafe) return;
        animate(press, 0.94, springs.flick);
      }}
      onPointerUp={(event) => {
        drag.onPointerUp(event);
        animate(press, 1, springs.flick);
      }}
      onPointerCancel={(event) => {
        drag.onPointerCancel(event);
        animate(press, 1, springs.flick);
      }}
      onKeyDown={onKeyDown}
      style={{ scale: press }}
      className={cn(
        "group/harmonic-bands-fader flex max-w-14 flex-1 touch-pan-x flex-col items-center gap-1 rounded-2 select-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-ns-resize",
      )}
    >
      {/* The harmonic's colour rides a custom property on a plain element:
          motion does not re-apply a changed colour on elements it manages. */}
      <span
        ref={chipRef}
        aria-hidden
        className="relative h-9 w-full"
        style={{ ["--hb-colour" as string]: colour } as React.CSSProperties}
      >
        <motion.span
          className="absolute inset-0 overflow-hidden rounded-2 border border-hairline bg-surface-1 transition-colors group-hover/harmonic-bands-fader:border-hairline-strong"
          style={{ scaleY: stretch, originY: origin }}
        >
          <motion.span
            className="absolute inset-x-0 bottom-0 border-t-[1.5px] border-(--hb-colour) bg-[color-mix(in_oklab,var(--hb-colour)_22%,transparent)]"
            style={{ height: fill }}
          />
          <span className="absolute inset-0 flex items-center">
            <svg
              viewBox="0 0 32 14"
              preserveAspectRatio="none"
              className="h-3.5 w-full px-1 transition-transform duration-150 group-hover/harmonic-bands-fader:-translate-y-0.5"
            >
              <motion.path
                d={path}
                fill="none"
                strokeWidth={1.4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-(--hb-colour)"
              />
            </svg>
          </span>
        </motion.span>
      </span>
      <span
        aria-hidden
        className="font-mono text-[9px] leading-none text-ink-3 tabular-nums transition-colors group-hover/harmonic-bands-fader:text-ink-2 group-focus-visible/harmonic-bands-fader:text-foreground"
      >
        {SHORT[index] ?? `${index + 1}f`}
      </span>
    </motion.div>
  );
}

/**
 * Layered strata of colour whose top edges are one travelling wave: the sum
 * of a few harmonics of a fundamental, each tuned by a small fader beneath.
 * Every band trails the one above by a phase lag, so the stack reads as one
 * wave moving through layers; `dispersion` decides whether the shape travels
 * rigidly or keeps re-forming as each harmonic runs at its own speed.
 *
 * A fader change morphs the shape on the glide spring, band by band — each
 * lower band takes the new target a cascade step after the one above — and
 * the palette slides with the spectrum, pale for a pure fundamental and deep
 * when the upper harmonics lead. The faders are real vertical sliders: drag
 * 1:1 with rubber-banded ends and a snap settle, tap to jump, arrows, Page
 * keys, Home and End. Canvas 2D, a loop only while something moves, on
 * screen. Under reduced motion the flow stops and a new chord is drawn at
 * once.
 */
export function HarmonicBands({
  harmonics = 4,
  palette = "dusk",
  flow = 1,
  value,
  defaultValue = DEFAULT_LEVELS,
  onValueChange,
  bands = 5,
  amplitude = 0.6,
  cycles = 1.25,
  dispersion = 0.4,
  lag = 0.35,
  sheen = 0.5,
  controls = true,
  label = "Harmonics",
  paused = false,
  seed = 3,
  dpr = 2,
  disabled = false,
  className,
}: HarmonicBandsProps) {
  const motionSafe = useMotionSafe();
  const n = Math.round(clamp(harmonics, 2, MAX_HARMONICS));
  const count = Math.round(clamp(bands, 3, MAX_BANDS));
  const [own, setOwn] = React.useState<number[]>(() =>
    defaultValue.slice(0, MAX_HARMONICS),
  );
  const source = value ?? own;
  const levels = React.useMemo(
    () =>
      Array.from({ length: n }, (_, j) =>
        r2(clamp(source[j] ?? DEFAULT_LEVELS[j] ?? 0, 0, 1)),
      ),
    [source, n],
  );
  const stops = stopsOf(palette);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const [, nudge] = React.useReducer((x: number) => x + 1, 0);

  const shape: Shape = {
    harmonics: n,
    bands: count,
    amplitude: clamp(amplitude, 0, 1),
    cycles: clamp(cycles, 0.5, 3),
    dispersion: clamp(dispersion, 0, 1),
    lag: clamp(lag, 0, 1),
    seed: Math.round(seed),
  };
  const config: Config = {
    ...shape,
    flow,
    sheen,
    paused,
    dpr,
    motionSafe,
    colorKey: stops.join("|"),
    stops: stops.length,
  };
  const latest = React.useRef({ config, levels });

  React.useEffect(() => {
    latest.current = { config, levels };
    engine.current?.configure(config);
  });

  const levelsKey = levels.join(",");
  React.useEffect(() => {
    engine.current?.retarget(latest.current.levels);
  }, [levelsKey]);

  React.useEffect(() => {
    const root = rootRef.current;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !host || !canvas || !carriers) return;
    const e = createEngine(root, host, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current.config);
    e.retarget(latest.current.levels);
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

  const bindHost = React.useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node;
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

  const setLevel = (index: number, level: number) => {
    const next = levels.slice();
    next[index] = level;
    if (value === undefined) {
      setOwn((prev) => {
        const merged = prev.slice();
        merged[index] = level;
        return merged;
      });
    }
    onValueChange?.(next);
    // A host that refuses the change still re-renders the faders, so they
    // can settle back to the level it kept.
    nudge();
  };

  const still = stillBands(levels, shape, stops);

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/harmonic-bands relative isolate flex h-56 w-full flex-col overflow-clip rounded-3 border border-hairline bg-card",
        className,
      )}
    >
      <div ref={bindHost} className="relative grow basis-0 overflow-hidden">
        <svg
          aria-hidden
          viewBox={`0 0 ${STILL_W} ${STILL_H}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/harmonic-bands:opacity-0"
        >
          {still.map((band) => (
            <g key={band.b}>
              <path d={band.fill} style={{ fill: band.colour }} />
              <path
                d={band.edge}
                fill="none"
                stroke="white"
                strokeOpacity={r2(0.18 + clamp(sheen, 0, 1) * 0.5)}
                strokeWidth={1.1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/harmonic-bands:opacity-100"
        />
      </div>
      {controls ? (
        <div
          role="group"
          aria-label={label}
          className="flex shrink-0 justify-center gap-1.5 border-t border-hairline bg-card px-3 py-2"
        >
          {levels.map((level, j) => (
            <Fader
              key={j}
              index={j}
              level={level}
              colour={mixAt(stops, harmonicSpot(j, n))}
              disabled={disabled}
              motionSafe={motionSafe}
              onLevel={setLevel}
            />
          ))}
        </div>
      ) : null}
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {stops.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
    </div>
  );
}
