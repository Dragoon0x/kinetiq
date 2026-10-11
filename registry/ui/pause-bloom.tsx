"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type PauseBloomPalette = "garden" | "harbour" | "ember" | "ink";

export type PauseBloomProps = {
  /** The content laid on the paper: a headline, a card, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** The pigments the drops step through, one per drop. @default "garden" */
  palette?: PauseBloomPalette;
  /** Two to eight CSS colours that replace `palette`. */
  colors?: string[];
  /** How far a bloom spreads if you rest until it is done, px (16 to 200; held under 45% of the box). @default 72 */
  bloomSize?: number;
  /** How long a dried bloom keeps its colour before the paper is clean, seconds (1 to 60). @default 12 */
  dryTime?: number;
  /** How long the pointer must rest before a drop falls, ms. @default 260 */
  restDelay?: number;
  /** How long a bloom takes to reach `bloomSize` while you rest, ms. @default 1800 */
  growTime?: number;
  /** How ragged a bloom's edge is, 0 (a soft round pool) to 1 (cauliflower). @default 0.5 */
  raggedness?: number;
  /** How dark the tide line gathers at a bloom's edge as it dries, 0 to 1. @default 0.5 */
  edge?: number;
  /** How much the pigment settles into the paper's tooth as it dries, 0 to 1. @default 0.4 */
  granulation?: number;
  /** How much pigment each drop carries, 0 (a tint) to 1 (a full wash). @default 0.7 */
  strength?: number;
  /** Blooms kept on the paper; past this the oldest dries clean at once. @default 24 */
  maxBlooms?: number;
  /** Dried blooms already on the paper when it first shows, 0 to 6. @default 3 */
  defaultBlooms?: number;
  /** How long a finger must hold still on touch before a drop falls, ms. @default 380 */
  longPress?: number;
  /** The paper's colour, any CSS colour; light paper mixes pigments like paint, dark paper like light. @default "var(--card)" */
  paper?: string;
  /** Resting the pointer paints. @default true */
  interactive?: boolean;
  /** Hold the paper as it is: nothing grows, dries or falls. @default false */
  paused?: boolean;
  /** Any change blots the paper clean. */
  clearKey?: string | number;
  /** Seeds the bloom shapes and the paper's first blooms. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The paper's accessible name, for the keyboard's way in. @default "Wet paper" */
  label?: string;
  /** A drop fell: how many so far, and which pigment of the palette it carried. */
  onBloom?: (count: number, pigment: number) => void;
  /** The last bloom has dried clean. */
  onClean?: () => void;
  /** Nothing paints and the keyboard's way in is off. @default false */
  disabled?: boolean;
  /** Sizes the paper. @default "h-56 w-full" */
  className?: string;
};

type Pigment = { name: string; color: string };

/**
 * Pigments as pigment, not as text colour: a token's hue and chroma at a
 * fixed lightness, a step lighter on dark paper so the mix still reads there.
 */
const pig = (token: string, l: number, c: number, turn = 0) => {
  const h = turn ? `calc(h + ${turn})` : "h";
  return `light-dark(oklch(from var(${token}) ${l} ${c} ${h}), oklch(from var(${token}) ${Math.round(Math.min(0.86, l + 0.05) * 1000) / 1000} ${c} ${h}))`;
};

const PALETTES: Record<PauseBloomPalette, Pigment[]> = {
  garden: [
    { name: "sap green", color: pig("--success", 0.62, 0.12) },
    { name: "rose madder", color: pig("--danger", 0.64, 0.15, -8) },
    { name: "gamboge", color: pig("--warn", 0.8, 0.14) },
    { name: "ultramarine", color: pig("--accent-bright", 0.56, 0.16) },
  ],
  harbour: [
    { name: "ultramarine", color: pig("--accent-bright", 0.56, 0.15) },
    { name: "viridian", color: pig("--signal", 0.62, 0.1) },
    { name: "cerulean", color: pig("--accent-bright", 0.7, 0.11, -40) },
    { name: "slate", color: pig("--accent-bright", 0.5, 0.04) },
  ],
  ember: [
    { name: "vermilion", color: pig("--danger", 0.64, 0.17, 12) },
    { name: "quinacridone gold", color: pig("--warn", 0.74, 0.14, -10) },
    { name: "rose", color: pig("--danger", 0.6, 0.14, -15) },
    { name: "burnt sienna", color: pig("--warn", 0.55, 0.1, -35) },
  ],
  ink: [
    { name: "indigo", color: pig("--accent-bright", 0.44, 0.08) },
    { name: "sepia", color: pig("--warn", 0.46, 0.06, -20) },
    { name: "lamp black", color: pig("--ink-2", 0.42, 0.01) },
  ],
};

/** Stacked translucent layers per bloom: enough for a feathered edge, few enough to draw live. */
const LAYERS = 14;
/** The pointer may wander this far and still be resting, px. */
const REST_SLOP = 5;
const TOUCH_SLOP = 9;
/** How long a falling drop takes to land, s. */
const FALL = 0.14;
/** How long the landing's splash ring lasts, s. */
const SPLASH = 0.22;
/** How long a settled bloom takes to dry (tide line, granulation), s. */
const DRYING = 0.55;
/** Reduced motion's crossfade, s. */
const APPEAR = 0.24;
const BLOT = 0.4;
/** The paper's first blooms hold this long before they start drying clean, s. */
const FIRST_HOLD = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A rough normal deviate, mean 0, sd ~0.5: cheap and seeded. */
const gauss = (rand: () => number) => rand() + rand() + rand() - 1.5;

/**
 * One fractal-deformed polygon pass: every edge gains a midpoint pushed off
 * by a seeded deviate scaled by the edge's length and that stretch of the
 * outline's own variance, so some sides stay smooth and some cauliflower.
 */
function deform(
  pts: number[],
  vars: number[],
  amount: number,
  rand: () => number,
): { pts: number[]; vars: number[] } {
  const out: number[] = [];
  const outVars: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i += 1) {
    const ax = pts[i * 2] ?? 0;
    const ay = pts[i * 2 + 1] ?? 0;
    const j = (i + 1) % n;
    const bx = pts[j * 2] ?? 0;
    const by = pts[j * 2 + 1] ?? 0;
    const v = vars[i] ?? 1;
    const len = Math.hypot(bx - ax, by - ay);
    const a = rand() * Math.PI * 2;
    const d = gauss(rand) * len * amount * v;
    out.push(
      ax,
      ay,
      (ax + bx) / 2 + Math.cos(a) * d,
      (ay + by) / 2 + Math.sin(a) * d,
    );
    outVars.push(v, clamp(v * (0.85 + rand() * 0.3), 0.2, 2));
  }
  return { pts: out, vars: outVars };
}

type Geometry = { layers: Float32Array[]; reach: number[] };

/** A bloom's layers in unit radius: a shared ragged base, then each layer's own two passes. */
function bloomGeometry(seed: number, raggedness: number): Geometry {
  const rand = lcg(seed * 7919 + 17);
  const amount = 0.18 + 0.62 * clamp(raggedness, 0, 1);
  let pts: number[] = [];
  let vars: number[] = [];
  const base = 8;
  for (let i = 0; i < base; i += 1) {
    const a = ((i + rand() * 0.4) / base) * Math.PI * 2;
    const r = 1 + gauss(rand) * 0.14;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
    vars.push(0.4 + rand() * 1.2);
  }
  // Broad lobes first, finer wandering after: each pass gentler than the last.
  for (const k of [1.05, 0.8, 0.65]) {
    ({ pts, vars } = deform(pts, vars, amount * k, rand));
  }
  // Back to a mean radius of one, so `bloomSize` is the size you get.
  let mean = 0;
  for (let i = 0; i < pts.length; i += 2) {
    mean += Math.hypot(pts[i] ?? 0, pts[i + 1] ?? 0);
  }
  mean = mean / (pts.length / 2) || 1;
  pts = pts.map((v) => v / mean);
  const layers: Float32Array[] = [];
  const reaches: number[] = [];
  for (let l = 0; l < LAYERS; l += 1) {
    let lp = pts;
    let lv = vars;
    for (const k of [0.7, 0.55, 0.45]) {
      ({ pts: lp, vars: lv } = deform(lp, lv, amount * k, rand));
    }
    // Layers differ in reach, so their edges stagger into a feather.
    const reach = 0.78 + 0.26 * rand();
    const arr = new Float32Array(lp.length);
    for (let i = 0; i < lp.length; i += 1) arr[i] = (lp[i] ?? 0) * reach;
    layers.push(arr);
    reaches.push(reach);
  }
  return { layers, reach: reaches };
}

/** The furthest any layer reaches, in unit radius: sizes the baked image. */
function extentOf(layers: readonly Float32Array[]): number {
  let m = 1;
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i += 2) {
      m = Math.max(m, Math.hypot(layer[i] ?? 0, layer[i + 1] ?? 0));
    }
  }
  return m;
}

/** Any CSS colour the canvas understands, as an `rgb()` string and a luminance. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): { css: string; lum: number } => {
    if (!ctx) return { css: colour, lum: 1 };
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const r = d[0] ?? 0;
    const g = d[1] ?? 0;
    const b = d[2] ?? 0;
    return {
      css: `rgb(${r}, ${g}, ${b})`,
      lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255,
    };
  };
}

/** Elements a rest over should leave alone: the reader is about to click them. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  pigments: number;
  colorKey: string;
  bloomSize: number;
  dryTime: number;
  restDelay: number;
  growTime: number;
  raggedness: number;
  edge: number;
  granulation: number;
  strength: number;
  maxBlooms: number;
  defaultBlooms: number;
  longPress: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Report = {
  bloom: (count: number, pigment: number) => void;
  /** The paper is clean; `painted` says whether the visitor had painted on it. */
  clean: (painted: boolean) => void;
};

type Stage = "growing" | "drying" | "dry";

type Bloom = {
  seed: number;
  x: number;
  y: number;
  pigment: number;
  /** Radius spring, px: value, velocity, target. */
  r: number;
  v: number;
  target: number;
  stage: Stage;
  /** Sim time the drying began; the dry image fades in over DRYING. */
  dryAt: number;
  /** Sim time the bloom starts drying clean, and how long that takes. */
  fadeAt: number;
  fadeFor: number;
  /** Reduced motion's crossfade in, 0 → 1. */
  appear: number;
  geometry: Geometry | null;
  baked: HTMLCanvasElement | null;
  bakedR: number;
  alpha: number;
};

type Drop = { x: number; y: number; pigment: number; t0: number };

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  hover: (x: number, y: number, target: Element | null) => void;
  touchDown: (x: number, y: number, target: Element | null) => void;
  touchMove: (x: number, y: number) => void;
  lift: () => void;
  leave: () => void;
  keyFocus: (on: boolean) => void;
  keyMove: (dx: number, dy: number) => void;
  keyDrop: () => void;
  blot: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  ring: SVGSVGElement,
  visible: { current: boolean },
  report: { current: Report },
): Engine {
  const ctx = canvas.getContext("2d");
  const read = colourReader();
  let cfg: Config | null = null;
  let inks: string[] = [];
  let lightPaper = true;
  let grain: HTMLCanvasElement | null = null;
  const size = { w: 0, h: 0, dpr: 1 };
  let frame = 0;
  let last = 0;
  let lastDraw = 0;
  let t = 0;
  let disposed = false;
  let started = false;
  let count = 0;
  let next = 0;
  let hadPaint = false;
  const blooms: Bloom[] = [];
  const drops: Drop[] = [];
  // The splash as a drop lands: a thin ring that opens and is gone.
  const splashes: Drop[] = [];

  // The hand: where it rests, when its rest completes, and the bloom it feeds.
  const hand = {
    present: false,
    touch: false,
    key: false,
    x: 0,
    y: 0,
    ax: Number.NaN,
    ay: Number.NaN,
    over: null as Element | null,
    timer: 0,
    feeding: null as Bloom | null,
    pressing: false,
  };

  const maxR = () =>
    clamp(
      Math.min(cfg?.bloomSize ?? 72, Math.min(size.w, size.h) * 0.45),
      8,
      200,
    );
  /** The growth spring: critically damped, stretched to reach 98% in growTime. */
  const omega = () => 5.83 / Math.max(0.2, (cfg?.growTime ?? 1800) / 1000);

  const inkOf = (pigment: number) =>
    inks[pigment % Math.max(1, inks.length)] ?? "rgb(110, 110, 110)";

  const ensureGrain = () => {
    if (grain) return grain;
    const g = document.createElement("canvas");
    g.width = 96;
    g.height = 96;
    const gctx = g.getContext("2d");
    if (gctx) {
      const rand = lcg(911);
      for (let i = 0; i < 900; i += 1) {
        gctx.fillStyle = `rgba(0, 0, 0, ${r3(0.25 + rand() * 0.75)})`;
        const s = rand() < 0.2 ? 2 : 1;
        gctx.fillRect(Math.floor(rand() * 96), Math.floor(rand() * 96), s, s);
      }
    }
    grain = g;
    return g;
  };

  /** Traces one layer of a bloom as a path, at radius r around (x, y), in device px. */
  const trace = (
    c: CanvasRenderingContext2D,
    layer: Float32Array,
    x: number,
    y: number,
    r: number,
  ) => {
    // Through the midpoints with the vertices as handles: the fractal edge
    // stays ragged without the straight runs of a polygon.
    const n = layer.length / 2;
    const px = (i: number) => x + (layer[(i % n) * 2] ?? 0) * r;
    const py = (i: number) => y + (layer[(i % n) * 2 + 1] ?? 0) * r;
    c.beginPath();
    c.moveTo((px(0) + px(1)) / 2, (py(0) + py(1)) / 2);
    for (let i = 1; i <= n; i += 1) {
      c.quadraticCurveTo(
        px(i),
        py(i),
        (px(i) + px(i + 1)) / 2,
        (py(i) + py(i + 1)) / 2,
      );
    }
    c.closePath();
  };

  /** The wet bloom: layers only, no tide line, no granulation. */
  const paintWet = (
    c: CanvasRenderingContext2D,
    b: Bloom,
    x: number,
    y: number,
    r: number,
    alpha: number,
  ) => {
    b.geometry ??= bloomGeometry(b.seed, cfg?.raggedness ?? 0.5);
    c.fillStyle = inkOf(b.pigment);
    // Screened on dark paper the layers add up faster, so each carries less.
    const each =
      clamp(cfg?.strength ?? 0.7, 0, 1) * (lightPaper ? 0.085 : 0.055);
    c.globalAlpha = each * alpha;
    for (const layer of b.geometry.layers) {
      trace(c, layer, x, y, r);
      c.fill();
    }
  };

  /**
   * Bakes a settled bloom into its own small canvas, dried: the wet layers,
   * then the tide line where the pigment gathered at the edge, then the
   * granulation lifted out of it in specks of the paper's tooth.
   */
  const bake = (b: Bloom) => {
    b.geometry ??= bloomGeometry(b.seed, cfg?.raggedness ?? 0.5);
    const d = size.dpr;
    const reach = extentOf(b.geometry.layers) * b.r + 3;
    const px = Math.max(2, Math.ceil(reach * 2 * d));
    const img = b.baked ?? document.createElement("canvas");
    img.width = px;
    img.height = px;
    const c = img.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, px, px);
    c.globalCompositeOperation = "source-over";
    const mid = px / 2;
    paintWet(c, b, mid, mid, b.r * d, 1);
    const edge = clamp(cfg?.edge ?? 0.5, 0, 1);
    if (edge > 0) {
      // The tide line: pigment carried to the rim as the water left, so
      // only the outermost layers' edges are drawn, finely, over each other.
      c.strokeStyle = inkOf(b.pigment);
      c.lineWidth = Math.max(1, 1.2 * d);
      c.lineJoin = "round";
      const { layers, reach: reaches } = b.geometry;
      for (let l = 0; l < layers.length; l += 1) {
        const layer = layers[l];
        const reach = reaches[l] ?? 0;
        if (!layer || reach < 0.9) continue;
        c.globalAlpha = edge * 0.2 * (0.6 + (reach - 0.9) * 3);
        trace(c, layer, mid, mid, b.r * d);
        c.stroke();
      }
    }
    const gran = clamp(cfg?.granulation ?? 0.4, 0, 1);
    if (gran > 0) {
      const pattern = c.createPattern(ensureGrain(), "repeat");
      if (pattern) {
        c.globalCompositeOperation = "destination-out";
        c.globalAlpha = gran * 0.55;
        c.fillStyle = pattern;
        c.fillRect(0, 0, px, px);
      }
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    b.baked = img;
    b.bakedR = reach;
  };

  const rebakeAll = () => {
    for (const b of blooms) if (b.stage !== "growing") bake(b);
  };

  const readColours = () => {
    const kids = carriers.children;
    const next: string[] = [];
    for (let i = 0; i < kids.length - 1; i += 1) {
      const el = kids[i];
      if (el) next.push(read(getComputedStyle(el).color).css);
    }
    inks = next;
    const paperEl = kids[kids.length - 1];
    if (paperEl) {
      const paper = read(getComputedStyle(paperEl).color);
      lightPaper = paper.lum > 0.45;
    }
    canvas.style.mixBlendMode = lightPaper ? "multiply" : "screen";
    rebakeAll();
  };

  const newBloom = (
    x: number,
    y: number,
    pigment: number,
    r: number,
    stage: Stage,
  ): Bloom => {
    const b: Bloom = {
      seed: (cfg?.seed ?? 1) * 1013 + count * 131 + Math.round(x * 7 + y * 3),
      x,
      y,
      pigment,
      r,
      v: 0,
      target: r,
      stage,
      dryAt: t,
      // A growing bloom is not drying yet; its fade is set when it settles.
      fadeAt: stage === "growing" ? Number.POSITIVE_INFINITY : t,
      fadeFor: Math.max(1, cfg?.dryTime ?? 12),
      appear: 1,
      geometry: null,
      baked: null,
      bakedR: 0,
      alpha: 1,
    };
    blooms.push(b);
    hadPaint = true;
    // Past the cap the oldest dries clean quickly instead of vanishing.
    const cap = Math.max(1, Math.round(cfg?.maxBlooms ?? 24));
    let over = blooms.length - cap;
    for (const old of blooms) {
      if (over <= 0) break;
      if (old === b || old.fadeFor <= BLOT) continue;
      old.fadeAt = Math.min(old.fadeAt, t);
      old.fadeFor = BLOT;
      over -= 1;
    }
    return b;
  };

  /** Seeds the paper with a few dried blooms, as if someone had been painting. */
  const seedPaper = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const n = clamp(Math.round(c.defaultBlooms), 0, 6);
    const rand = lcg(c.seed * 31 + 5);
    const spots = [
      [0.16, 0.34],
      [0.82, 0.66],
      [0.58, 0.22],
      [0.33, 0.78],
      [0.9, 0.2],
      [0.06, 0.74],
    ];
    for (let i = 0; i < n; i += 1) {
      const [fx = 0.5, fy = 0.5] = spots[i] ?? [];
      const b = newBloom(
        (fx + (rand() - 0.5) * 0.06) * size.w,
        (fy + (rand() - 0.5) * 0.08) * size.h,
        i % Math.max(1, c.pigments),
        maxR() * (0.62 + rand() * 0.34),
        "dry",
      );
      b.fadeAt = t + FIRST_HOLD + i * 0.6;
      bake(b);
    }
    next = n;
  };

  const fall = (x: number, y: number) => {
    const c = cfg;
    if (!c) return;
    const pigment = next % Math.max(1, c.pigments);
    next += 1;
    count += 1;
    report.current.bloom(count, pigment);
    if (!c.motionSafe) {
      // Reduced motion: no fall and no growth — the bloom arrives at its size, dried, by crossfade.
      const b = newBloom(x, y, pigment, maxR(), "dry");
      b.appear = 0;
      b.fadeAt = t + 0.6;
      bake(b);
      return;
    }
    drops.push({ x, y, pigment, t0: t });
  };

  const land = (d: Drop) => {
    splashes.push({ x: d.x, y: d.y, pigment: d.pigment, t0: t });
    const b = newBloom(d.x, d.y, d.pigment, 1.5, "growing");
    b.target = maxR();
    // The splash gives the bloom its first push outward.
    b.v = omega() * maxR() * 0.22;
    if (
      hand.present &&
      Math.hypot(hand.x - d.x, hand.y - d.y) <= REST_SLOP * 2
    ) {
      hand.feeding = b;
    } else {
      stop(b);
    }
  };

  /** Stops a growing bloom where it is: it coasts on what speed it has, then dries. */
  const stop = (b: Bloom | null) => {
    if (!b || b.stage !== "growing") return;
    b.target = Math.min(b.target, b.r + Math.max(0, b.v) / omega());
    if (hand.feeding === b) hand.feeding = null;
  };

  const settleGrowth = (b: Bloom, dt: number) => {
    const w = omega();
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const a = -2 * w * b.v - w * w * (b.r - b.target);
      b.v += a * h;
      b.r += b.v * h;
    }
    if (
      hand.feeding !== b &&
      Math.abs(b.r - b.target) < 0.25 &&
      Math.abs(b.v) < 2
    ) {
      b.r = b.target;
      b.v = 0;
      b.stage = "drying";
      b.dryAt = t;
      b.fadeAt = Math.min(b.fadeAt, t + DRYING + 0.8);
      bake(b);
    } else if (
      hand.feeding === b &&
      b.target - b.r < 0.4 &&
      Math.abs(b.v) < 2
    ) {
      // Rested to the end: the bloom has drunk all the water it will.
      hand.feeding = null;
    }
  };

  const step = (dt: number) => {
    for (let i = splashes.length - 1; i >= 0; i -= 1) {
      if (t - (splashes[i]?.t0 ?? 0) > SPLASH) splashes.splice(i, 1);
    }
    for (let i = drops.length - 1; i >= 0; i -= 1) {
      const d = drops[i];
      if (d && t - d.t0 >= FALL) {
        drops.splice(i, 1);
        land(d);
      }
    }
    for (let i = blooms.length - 1; i >= 0; i -= 1) {
      const b = blooms[i];
      if (!b) continue;
      if (b.stage === "growing") settleGrowth(b, dt);
      else if (b.stage === "drying" && t - b.dryAt >= DRYING) b.stage = "dry";
      if (b.appear < 1) b.appear = Math.min(1, b.appear + dt / APPEAR);
      const f = clamp((t - b.fadeAt) / b.fadeFor, 0, 1);
      // Drying clean is slow at first and quickens, the way a wash lifts.
      b.alpha = 1 - f * f * (3 - 2 * f);
      if (b.stage !== "growing" && f >= 1) blooms.splice(i, 1);
    }
    if (hadPaint && blooms.length === 0 && drops.length === 0) {
      hadPaint = false;
      report.current.clean(count > 0);
    }
  };

  const draw = () => {
    if (!ctx || size.w < 1) return;
    const d = size.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Pigments mingle: multiplied on light paper like paint, screened on dark.
    ctx.globalCompositeOperation = lightPaper ? "multiply" : "screen";
    for (const b of blooms) {
      const alpha = b.alpha * b.appear;
      if (alpha <= 0.002) continue;
      const dryMix =
        b.stage === "growing"
          ? 0
          : b.stage === "drying"
            ? clamp((t - b.dryAt) / DRYING, 0, 1)
            : 1;
      if (dryMix < 1)
        paintWet(ctx, b, b.x * d, b.y * d, b.r * d, alpha * (1 - dryMix));
      if (dryMix > 0 && b.baked) {
        const s = b.bakedR * d;
        ctx.globalAlpha = alpha * dryMix;
        ctx.drawImage(b.baked, b.x * d - s, b.y * d - s, s * 2, s * 2);
      }
    }
    for (const sp of splashes) {
      const k = clamp((t - sp.t0) / SPLASH, 0, 1);
      const open = 1 - (1 - k) * (1 - k);
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.strokeStyle = inkOf(sp.pigment);
      ctx.lineWidth = Math.max(1, 0.9 * d);
      ctx.beginPath();
      ctx.arc(sp.x * d, sp.y * d, (2.5 + 9 * open) * d, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const drop of drops) {
      const p = clamp((t - drop.t0) / FALL, 0, 1);
      // Falls under gravity: ease-in, stretched into a teardrop by its speed.
      const fallen = p * p;
      const y = (drop.y - 10 * (1 - fallen)) * d;
      const r = 2.4 * d;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = inkOf(drop.pigment);
      ctx.beginPath();
      ctx.ellipse(
        drop.x * d,
        y,
        r * (1 - 0.25 * p),
        r * (1 + 0.6 * p),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!started) {
      started = true;
      root.setAttribute("data-live", "");
    }
  };

  /** Something still has to change: a drop, a bloom growing or drying, a fade waiting or running. */
  const busy = () =>
    drops.length > 0 ||
    splashes.length > 0 ||
    blooms.some((b) => b.stage !== "dry" || b.appear < 1 || b.alpha > 0);

  /** Only slow drying is left: twenty frames a second is plenty, and a hold draws nothing. */
  const calm = () =>
    drops.length === 0 &&
    splashes.length === 0 &&
    blooms.every((b) => b.stage === "dry" && b.appear >= 1);

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || c.paused) {
      last = 0;
      return;
    }
    const quiet = calm();
    if (quiet && last && now - lastDraw < 50) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    lastDraw = now;
    t += dt;
    step(dt);
    const fading = blooms.some((b) => t >= b.fadeAt);
    if (!quiet || fading || blooms.length === 0) draw();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (cfg?.paused) return;
    frame = window.requestAnimationFrame(tick);
  };

  // The dwell gauge: a ring that fills while the pointer rests, by CSS
  // transition, so a resting pointer costs no frames at all.
  const ringArc = ring.querySelector<SVGCircleElement>("[data-arc]");
  const ringPlace = (x: number, y: number, big: boolean) => {
    const s = big ? 1.6 : 1;
    ring.style.transform = `translate(${r3(x - 20)}px, ${r3(y - 20)}px) scale(${s})`;
  };
  const ringRun = (ms: number) => {
    if (!ringArc) return;
    const reduced = !cfg?.motionSafe;
    ring.style.transition = "none";
    ring.style.opacity = "0";
    ringArc.style.transition = "none";
    ringArc.style.strokeDashoffset = reduced ? "0" : "1";
    // Reading layout commits the reset before the sweep starts.
    void ring.getBoundingClientRect();
    const wait = Math.min(90, ms * 0.3);
    ring.style.transition = `opacity 120ms ease-out ${Math.round(wait)}ms`;
    ring.style.opacity = "1";
    if (!reduced) {
      ringArc.style.transition = `stroke-dashoffset ${Math.max(0, Math.round(ms - wait))}ms linear ${Math.round(wait)}ms`;
      ringArc.style.strokeDashoffset = "0";
    }
  };
  const ringHide = () => {
    ring.style.transition = "opacity 160ms ease-in";
    ring.style.opacity = hand.key ? "0.55" : "0";
  };

  const clearTimer = () => {
    if (hand.timer) window.clearTimeout(hand.timer);
    hand.timer = 0;
  };

  const restAt = (ms: number) => {
    clearTimer();
    ringRun(ms);
    hand.timer = window.setTimeout(
      () => {
        hand.timer = 0;
        ringHide();
        const c = cfg;
        if (!c || !c.interactive || c.paused || !hand.present) return;
        if (
          hand.over &&
          hand.over.closest(INTERACTIVE) &&
          !hand.over.hasAttribute("data-paper")
        )
          return;
        fall(hand.ax, hand.ay);
        kick();
      },
      Math.max(0, ms),
    );
  };

  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const d = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    const first = size.w < 1;
    const dprChanged = d !== size.dpr;
    size.w = w;
    size.h = h;
    size.dpr = d;
    const bw = Math.max(1, Math.round(w * d));
    const bh = Math.max(1, Math.round(h * d));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (first) seedPaper();
    else if (dprChanged) rebakeAll();
    draw();
    kick();
  };

  return {
    configure(nextCfg) {
      const was = cfg;
      cfg = nextCfg;
      if (!was) {
        readColours();
        resize();
        return;
      }
      if (was.colorKey !== nextCfg.colorKey) readColours();
      else if (
        was.edge !== nextCfg.edge ||
        was.granulation !== nextCfg.granulation ||
        was.strength !== nextCfg.strength
      ) {
        rebakeAll();
      }
      if (was.dpr !== nextCfg.dpr) resize();
      // Until the visitor paints, the paper's first blooms follow the
      // settings, so a change of size or count shows at once.
      if (
        count === 0 &&
        (was.bloomSize !== nextCfg.bloomSize ||
          was.defaultBlooms !== nextCfg.defaultBlooms ||
          was.seed !== nextCfg.seed)
      ) {
        blooms.length = 0;
        seedPaper();
      }
      if (was.raggedness !== nextCfg.raggedness) {
        for (const b of blooms) b.geometry = null;
        rebakeAll();
      }
      if (was.dryTime !== nextCfg.dryTime) {
        for (const b of blooms)
          if (b.fadeFor > BLOT) b.fadeFor = Math.max(1, nextCfg.dryTime);
      }
      if (!nextCfg.interactive) {
        clearTimer();
        ringHide();
        stop(hand.feeding);
      }
      draw();
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
    hover(x, y, target) {
      const c = cfg;
      if (!c?.interactive || c.paused) return;
      hand.present = true;
      hand.touch = false;
      hand.x = x;
      hand.y = y;
      hand.over = target;
      ringPlace(x, y, false);
      const moved =
        hand.key ||
        Number.isNaN(hand.ax) ||
        Math.hypot(x - hand.ax, y - hand.ay) > REST_SLOP;
      // Within the slop the pointer is still resting: a pending drop keeps
      // its timer, a feeding bloom keeps growing, a finished one stays put.
      if (!moved) return;
      hand.key = false;
      hand.ax = x;
      hand.ay = y;
      stop(hand.feeding);
      restAt(c.restDelay);
      kick();
    },
    touchDown(x, y, target) {
      const c = cfg;
      if (!c?.interactive || c.paused) return;
      hand.present = true;
      hand.touch = true;
      hand.key = false;
      hand.x = x;
      hand.y = y;
      hand.ax = x;
      hand.ay = y;
      hand.over = target;
      ringPlace(x, y, true);
      restAt(c.longPress);
    },
    touchMove(x, y) {
      if (!hand.touch) return;
      hand.x = x;
      hand.y = y;
      if (Math.hypot(x - hand.ax, y - hand.ay) > TOUCH_SLOP) {
        // The finger is scrolling or drawing, not resting: no drop.
        clearTimer();
        ringHide();
        stop(hand.feeding);
        hand.touch = false;
        hand.present = false;
        kick();
      }
    },
    lift() {
      clearTimer();
      ringHide();
      stop(hand.feeding);
      if (hand.touch) {
        hand.touch = false;
        hand.present = false;
      }
      hand.pressing = false;
      kick();
    },
    leave() {
      clearTimer();
      stop(hand.feeding);
      hand.present = false;
      hand.ax = Number.NaN;
      ringHide();
      kick();
    },
    keyFocus(on) {
      hand.key = on;
      if (on) {
        if (!hand.present) {
          hand.x = size.w / 2;
          hand.y = size.h / 2;
        }
        hand.present = true;
        ringPlace(hand.x, hand.y, false);
        if (ringArc) {
          ringArc.style.transition = "none";
          ringArc.style.strokeDashoffset = "0";
        }
        ring.style.transition = "opacity 120ms ease-out";
        ring.style.opacity = "0.55";
      } else {
        clearTimer();
        stop(hand.feeding);
        hand.pressing = false;
        ring.style.transition = "opacity 160ms ease-in";
        ring.style.opacity = "0";
      }
    },
    keyMove(dx, dy) {
      hand.key = true;
      hand.present = true;
      stop(hand.feeding);
      hand.x = clamp(hand.x + dx, 0, size.w);
      hand.y = clamp(hand.y + dy, 0, size.h);
      hand.ax = hand.x;
      hand.ay = hand.y;
      ringPlace(hand.x, hand.y, false);
      ring.style.opacity = "0.55";
      kick();
    },
    keyDrop() {
      const c = cfg;
      if (!c?.interactive || c.paused || hand.pressing) return;
      hand.pressing = true;
      hand.present = true;
      hand.ax = hand.x;
      hand.ay = hand.y;
      fall(hand.x, hand.y);
      kick();
    },
    blot() {
      for (const b of blooms) {
        b.fadeAt = Math.min(b.fadeAt, t);
        b.fadeFor = BLOT;
        stop(b);
      }
      drops.length = 0;
      splashes.length = 0;
      kick();
    },
    dispose() {
      disposed = true;
      clearTimer();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
      blooms.length = 0;
      drops.length = 0;
    },
  };
}

/** Seeded dried blooms for the server's frame: the same places the canvas starts from. */
function standIn(seed: number, n: number) {
  const rand = lcg(seed * 31 + 5);
  const spots = [
    [16, 34],
    [82, 66],
    [58, 22],
    [33, 78],
    [90, 20],
    [6, 74],
  ];
  const out: { x: number; y: number; r: number; i: number }[] = [];
  for (let i = 0; i < clamp(Math.round(n), 0, 6); i += 1) {
    const [x = 50, y = 50] = spots[i] ?? [];
    const jx = (rand() - 0.5) * 6;
    const jy = (rand() - 0.5) * 8;
    out.push({
      x: r3(x + jx),
      y: r3(y + jy),
      r: r3(0.62 + rand() * 0.34),
      i,
    });
  }
  return out;
}

/**
 * A sheet of wet watercolour paper behind your content, painted by resting.
 * Hold the pointer still and a drop of pigment falls at its tip and blooms
 * into the paper: a stack of fractal-edged translucent layers growing on a
 * critically damped curve, quick at first, slowing as the paper drinks it.
 * Move on and the bloom stops where it is and dries where it lies — a darker
 * tide line gathers at its edge and the pigment granulates into the paper's
 * tooth — and the next rest takes the next pigment. Overlapping blooms
 * mingle (multiplied on light paper, screened on dark), and the paper slowly
 * dries clean.
 *
 * Touch blooms on a long press; the keyboard's way in is a transparent button
 * behind the content: arrows move the brush, Space or Enter held lets a drop
 * bloom, Delete blots the paper. Under reduced motion a rest lays a dried
 * bloom at its full size by crossfade.
 */
export function PauseBloom({
  children,
  palette = "garden",
  colors,
  bloomSize = 72,
  dryTime = 12,
  restDelay = 260,
  growTime = 1800,
  raggedness = 0.5,
  edge = 0.5,
  granulation = 0.4,
  strength = 0.7,
  maxBlooms = 24,
  defaultBlooms = 3,
  longPress = 380,
  paper = "var(--card)",
  interactive = true,
  paused = false,
  clearKey,
  seed = 1,
  dpr = 2,
  label = "Wet paper",
  onBloom,
  onClean,
  disabled = false,
  className,
}: PauseBloomProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const filterId = `pb${uid.replace(/[^a-zA-Z0-9]/g, "")}`;

  const pigments: Pigment[] = React.useMemo(() => {
    const custom = (colors ?? []).filter(Boolean).slice(0, 8);
    if (custom.length >= 2) {
      return custom.map((color, i) => ({ name: `colour ${i + 1}`, color }));
    }
    return PALETTES[palette] ?? PALETTES.garden;
  }, [colors, palette]);
  const colorKey = pigments.map((p) => p.color).join("|") + `|${paper}`;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const ringRef = React.useRef<SVGSVGElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const names = React.useRef(pigments);
  const callbacks = React.useRef({ onBloom, onClean });
  const report = React.useRef<Report>({
    bloom: (count, pigment) => {
      const name = names.current[pigment]?.name ?? "Colour";
      setSaid((s) => ({
        n: s.n + 1,
        text: `${name.charAt(0).toUpperCase()}${name.slice(1)} blooming.`,
      }));
      callbacks.current.onBloom?.(count, pigment);
    },
    clean: (painted) => {
      // Only the visitor's own painting earns an announcement.
      if (painted) setSaid((s) => ({ n: s.n + 1, text: "Paper dry." }));
      callbacks.current.onClean?.();
    },
  });

  const live = interactive && !disabled;
  const config: Config = {
    pigments: pigments.length,
    colorKey,
    bloomSize: clamp(bloomSize, 16, 200),
    dryTime: clamp(dryTime, 1, 60),
    restDelay: Math.max(0, restDelay),
    growTime: Math.max(200, growTime),
    raggedness,
    edge,
    granulation,
    strength,
    maxBlooms,
    defaultBlooms,
    longPress: Math.max(120, longPress),
    interactive: live,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    names.current = pigments;
    callbacks.current = { onBloom, onClean };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    const ring = ringRef.current;
    if (!root || !canvas || !carriers || !ring) return;
    const e = createEngine(root, canvas, carriers, ring, visible, report);
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

  const lastClear = React.useRef(clearKey);
  React.useEffect(() => {
    if (lastClear.current === clearKey) return;
    lastClear.current = clearKey;
    engine.current?.blot();
  }, [clearKey]);

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

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const targetOf = (event: React.PointerEvent) =>
    event.target instanceof Element ? event.target : null;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    const at = local(event.clientX, event.clientY);
    if (event.pointerType === "touch") engine.current?.touchMove(at.x, at.y);
    else engine.current?.hover(at.x, at.y, targetOf(event));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live || event.pointerType !== "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.touchDown(at.x, at.y, targetOf(event));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const by = event.shiftKey ? 48 : 16;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      engine.current?.keyMove(move[0], move[1]);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) engine.current?.keyDrop();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      engine.current?.blot();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    engine.current?.lift();
  };

  const still = React.useMemo(
    () => standIn(seed, defaultBlooms),
    [seed, defaultBlooms],
  );

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") engine.current?.lift();
      }}
      onPointerCancel={() => engine.current?.lift()}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.leave();
      }}
      onContextMenu={(event) => {
        // A long press is a rest, not a request for the system menu.
        if (
          live &&
          (event.nativeEvent as PointerEvent).pointerType === "touch"
        ) {
          event.preventDefault();
        }
      }}
      className={cn(
        "group/pause-bloom relative isolate h-56 w-full overflow-clip [-webkit-touch-callout:none]",
        live ? "touch-manipulation" : "touch-auto",
        className,
      )}
      style={{ backgroundColor: paper }}
    >
      {/* The paper's tooth: a fixed grain, the same on every theme. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-[0.07] mix-blend-multiply dark:opacity-[0.1] dark:mix-blend-screen"
      >
        <filter id={`${filterId}-tooth`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={7}
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 -1.6 1.2"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${filterId}-tooth)`} />
      </svg>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full mix-blend-multiply transition-opacity duration-300 group-data-live/pause-bloom:opacity-0 dark:mix-blend-screen"
      >
        <defs>
          <filter
            id={`${filterId}-edge`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.045"
              numOctaves={2}
              seed={seed}
            />
            <feDisplacementMap in="SourceGraphic" scale={14} />
          </filter>
          {still.map((s) => (
            <radialGradient key={s.i} id={`${filterId}-g${s.i}`}>
              {[
                [0, 0.42],
                [78, 0.5],
                [92, 0.62],
                [100, 0],
              ].map(([at = 0, o = 0]) => (
                <stop
                  key={at}
                  offset={`${at}%`}
                  style={{
                    stopColor: pigments[s.i % pigments.length]?.color,
                    stopOpacity: o,
                  }}
                />
              ))}
            </radialGradient>
          ))}
        </defs>
        <g filter={`url(#${filterId}-edge)`}>
          {still.map((s) => (
            <circle
              key={s.i}
              cx={`${s.x}%`}
              cy={`${s.y}%`}
              r={r3(Math.min(bloomSize, 200) * s.r * 0.9)}
              fill={`url(#${filterId}-g${s.i})`}
            />
          ))}
        </g>
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {pigments.map((p, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: p.color }}
          />
        ))}
        <span
          className="transition-colors duration-1"
          style={{ color: paper }}
        />
      </span>
      <button
        ref={surfaceRef}
        type="button"
        data-paper=""
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={(event) => {
          if (live && event.currentTarget.matches(":focus-visible")) {
            engine.current?.keyFocus(true);
          }
        }}
        onBlur={() => engine.current?.keyFocus(false)}
        onClick={(event) => {
          // A click with no pointer and no key behind it — assistive
          // technology — lets one drop fall at the brush.
          if (event.detail !== 0 || !live) return;
          engine.current?.keyDrop();
          window.setTimeout(() => engine.current?.lift(), 700);
        }}
        className={cn(
          "absolute inset-0 z-0 size-full cursor-default rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="relative z-10 size-full">{children}</div>
      <svg
        ref={ringRef}
        aria-hidden
        width={40}
        height={40}
        viewBox="0 0 40 40"
        className="pointer-events-none absolute top-0 left-0 z-20 text-ink-2 opacity-0"
        style={{ transformOrigin: "20px 20px" }}
      >
        <circle
          cx={20}
          cy={20}
          r={11}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.22}
          strokeWidth={1}
        />
        <circle
          data-arc=""
          cx={20}
          cy={20}
          r={11}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1}
          transform="rotate(-90 20 20)"
        />
        <circle cx={20} cy={20} r={1.5} fill="currentColor" />
      </svg>
      {live ? (
        <p id={hintId} className="sr-only">
          Rest the pointer to drop colour. Arrow keys move the brush; hold Space
          or Enter to let a drop bloom; Delete blots the paper clean.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
