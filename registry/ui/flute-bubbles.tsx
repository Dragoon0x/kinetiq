"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Wine } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FluteBubblesTint = "straw" | "rose" | "amber" | "water";
export type FluteBubblesSide = "left" | "right" | "point";
export type FluteBubblesFizz = "lively" | "settling" | "flat";

export type FluteBubblesProps = {
  /** How many points on the glass give off a stream of bubbles, 2 to 16. @default 7 */
  streams?: number;
  /** How lively the wine is, 0 (slow, sparse strings) to 1 (tight, quick ones). @default 0.6 */
  fizz?: number;
  /** The wine. @default "straw" */
  tint?: FluteBubblesTint;
  /** Any CSS colour for the wine; it deepens toward the point of the bowl. Overrides `tint`. */
  liquidColor?: string;
  /** How full the bowl is, 0.5 to 0.92. @default 0.8 */
  fill?: number;
  /** Bubble size, 0 (the finest bead) to 1 (coarser). @default 0.5 */
  bubbleSize?: number;
  /** How brightly bubbles catch the light, 0 to 1. @default 0.7 */
  glint?: number;
  /** How many fresh streams a tap on the glass releases, 0 to 1. @default 0.6 */
  burst?: number;
  /** ms for the glass to go flat after a top-up; 0 keeps it lively for ever. @default 45000 */
  flatAfter?: number;
  /** A foam head swells on a top-up and settles. @default true */
  mousse?: boolean;
  /** Fires when the glass is tapped, with the wall the fresh streams rise from. */
  onTap?: (side: FluteBubblesSide) => void;
  /** Fires when the glass is topped up. */
  onTopUp?: () => void;
  /** Fires when the wine turns lively, starts settling or goes flat. */
  onFizzChange?: (state: FluteBubblesFizz) => void;
  /** A sizzle after each tap and top-up — only for the visitor's own press. @default false */
  sound?: boolean;
  /** Hold every bubble where it is. @default false */
  paused?: boolean;
  /** Seeds where the streams start and how every bubble is born. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The glass's accessible name. @default "Glass of sparkling wine" */
  label?: string;
  /** The glass takes no taps and cannot be topped up. @default false */
  disabled?: boolean;
  /** Sizes the piece; the flute keeps its shape and centres in it. @default "h-[30rem] w-full" */
  className?: string;
};

/* The flute is drawn in a 160 × 460 box, fitted (contain) to the piece. */
const VB_W = 160;
const VB_H = 460;
const CX = 80;
const RIM = 26;
const BOTTOM = 302;
const BOWL = BOTTOM - RIM;
const GLASS = 2.4;
const TAU = Math.PI * 2;
const STEP = 1 / 60;
const FLOOR = 0.12;
const MAX_BUBBLES = 900;
const MAX_POPS = 64;
const MAX_DROPS = 24;
const MAX_BURST = 40;
const COLLAR = 30;
const POP_LIFE = 0.16;
const MOUSSE = 22;

const TINTS: Record<FluteBubblesTint, { top: string; deep: string }> = {
  straw: {
    top: "oklch(from var(--warn) 0.93 0.075 calc(h + 12))",
    deep: "oklch(from var(--warn) 0.8 0.125 calc(h + 2))",
  },
  rose: {
    top: "oklch(from var(--danger) 0.9 0.05 calc(h + 6))",
    deep: "oklch(from var(--danger) 0.74 0.1 calc(h - 2))",
  },
  amber: {
    top: "oklch(from var(--warn) 0.85 0.12 calc(h - 8))",
    deep: "oklch(from var(--warn) 0.64 0.14 calc(h - 24))",
  },
  water: {
    top: "oklch(from var(--accent) 0.96 0.014 h / 0.5)",
    deep: "oklch(from var(--accent) 0.86 0.035 h / 0.62)",
  },
};

const HIGHLIGHT = "oklch(0.995 0.008 95)";
const GLASS_EDGE = "color-mix(in oklab, var(--ink) 34%, transparent)";
const GLASS_BODY = "color-mix(in oklab, var(--ink) 5%, transparent)";
const GLASS_SHINE = "light-dark(oklch(1 0 0 / 0.9), oklch(1 0 0 / 0.38))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A small seeded generator for the simulation (client only). */
function generator(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The bowl's inner half-width at a height: a tulip that opens a little below
 * the rim and closes into a rounded point. The same profile shapes the SVG,
 * clips the canvas and keeps every stream off the wall.
 */
function halfWidth(y: number): number {
  const t = clamp((y - RIM) / BOWL, 0, 1);
  return (
    31 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 3.2))) * (1 + 0.35 * t * (1 - t))
  );
}

const surfaceOf = (fill: number) =>
  r2(RIM + (1 - clamp(fill, 0.5, 0.92)) * BOWL);

/** The wine: the bowl's inside from the surface down, the surface rippled by `ripple`. */
function winePath(surface: number, ripple: number): string {
  const top = halfWidth(surface);
  const parts: string[] = [];
  const n = 16;
  for (let i = 0; i <= n; i += 1) {
    const x = CX - top + (2 * top * i) / n;
    const edge = Math.sin((Math.PI * i) / n);
    const y = surface + ripple * 2.2 * edge * Math.sin(i * 1.9 + 0.6);
    parts.push(`${i === 0 ? "M" : "L"} ${r2(x)} ${r2(y)}`);
  }
  const steps = 26;
  for (let i = 1; i <= steps; i += 1) {
    const y = surface + ((BOTTOM - surface) * i) / steps;
    parts.push(`L ${r2(CX + halfWidth(y))} ${r2(y)}`);
  }
  for (let i = steps - 1; i >= 1; i -= 1) {
    const y = surface + ((BOTTOM - surface) * i) / steps;
    parts.push(`L ${r2(CX - halfWidth(y))} ${r2(y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** The glass's outline: the bowl's outer wall tapering into the stem. */
const OUTER = (() => {
  const right: string[] = [];
  const left: string[] = [];
  const steps = 30;
  const end = BOTTOM - 10;
  for (let i = 0; i <= steps; i += 1) {
    const y = RIM + ((end - RIM) * i) / steps;
    const w = halfWidth(y) + GLASS;
    right.push(`${r2(CX + w)} ${r2(y)}`);
    left.push(`${r2(CX - w)} ${r2(y)}`);
  }
  const w = halfWidth(end) + GLASS;
  return [
    `M ${left[0]}`,
    ...left.slice(1).map((p) => `L ${p}`),
    `Q ${r2(CX - w * 0.55)} ${BOTTOM + 12} ${r2(CX - 3.2)} ${BOTTOM + 22}`,
    `L ${r2(CX - 2.4)} 420 Q ${r2(CX - 3)} 431 ${r2(CX - 14)} 434`,
    `L ${r2(CX + 14)} 434 Q ${r2(CX + 3)} 431 ${r2(CX + 2.4)} 420`,
    `L ${r2(CX + 3.2)} ${BOTTOM + 22}`,
    `Q ${r2(CX + w * 0.55)} ${BOTTOM + 12} ${right[right.length - 1]}`,
    ...right
      .slice(0, -1)
      .reverse()
      .map((p) => `L ${p}`),
    "Z",
  ].join(" ");
})();

/** The inner wall, drawn as two lines so the open rim reads. */
const INNER = (() => {
  const pts: string[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const y = RIM + (BOWL * i) / steps;
    pts.push(`${r2(CX - halfWidth(y))} ${r2(y)}`);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const y = RIM + (BOWL * i) / steps;
    pts.push(`${r2(CX + halfWidth(y))} ${r2(y)}`);
  }
  return `M ${pts.join(" L ")}`;
})();

/** An upright reflection on the bowl, following the wall at a share of its width. */
function reflection(share: number, from: number, to: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const y = from + ((to - from) * i) / 12;
    pts.push(`${r2(CX + share * halfWidth(y))} ${r2(y)}`);
  }
  return `M ${pts.join(" L ")}`;
}

type Site = {
  x: number;
  y: number;
  strength: number;
  sway: number;
  acc: number;
  life: number;
  rate: number;
  scale: number;
};

/**
 * The permanent nucleation points: one at the point of the bowl, some on the
 * side walls (strings that hug the glass) and the rest on the front and back
 * of the bowl, which a side view sees anywhere across it. Each has its own
 * strength and bubble size, as real nucleation sites do.
 */
function sitesFor(count: number, seed: number, surface: number): Site[] {
  const out: Site[] = [];
  const n = clamp(Math.round(count), 2, 16);
  const s = Math.round(seed);
  for (let i = 0; i < n; i += 1) {
    let x: number;
    let y: number;
    if (i === 0 || (i === 11 && n > 11)) {
      y = BOTTOM - 4 - hash(s, i, 1) * 6;
      x = CX + (hash(s, i, 2) - 0.5) * Math.min(5, halfWidth(y));
    } else {
      y = Math.max(surface + 44, RIM + (0.48 + 0.48 * hash(s, i, 3)) * BOWL);
      y = Math.min(y, BOTTOM - 12);
      const w = halfWidth(y);
      if (i % 3 === 1) {
        // A side wall: the string runs up just inside the glass.
        const side = i % 2 === 0 ? 1 : -1;
        x = CX + side * (w - 1.1) * (0.9 + 0.08 * hash(s, i, 4));
      } else {
        x = CX + (hash(s, i, 4) * 2 - 1) * (w - 3) * 0.86;
      }
    }
    out.push({
      x,
      y,
      strength: 0.6 + 0.6 * hash(s, i, 5),
      sway: hash(s, i, 6) * TAU,
      acc: hash(s, i, 7),
      life: Infinity,
      rate: 1,
      scale: 0.78 + 0.44 * hash(s, i, 8),
    });
  }
  return out;
}

/** Any CSS colour as an rgba() string the canvas can use, by painting one pixel. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): string => {
    if (!ctx) return "rgba(255, 255, 255, 1)";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(200, 200, 200)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0}, ${r2((d[3] ?? 255) / 255)})`;
  };
}

type Config = {
  streams: number;
  fizz: number;
  fill: number;
  bubbleSize: number;
  glint: number;
  burst: number;
  flatAfter: number;
  seed: number;
  dpr: number;
  paused: boolean;
  motionSafe: boolean;
  colorKey: string;
};

type Engine = {
  configure: (cfg: Config) => void;
  /** Taps the glass at a point in the 160 × 460 box; returns the wall the streams rise from. */
  tap: (x: number, y: number) => FluteBubblesSide;
  topUp: () => void;
  /** Without a running loop: lets any fresh streams run out, then redraws the still. */
  settle: () => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  report: (state: FluteBubblesFizz) => void,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let ratio = 1;
  const read = colourReader();
  // rim, body, highlight, wine top
  const colours = [
    "rgba(0,0,0,0.5)",
    "rgba(255,255,255,0.3)",
    "white",
    "white",
  ];

  // The simulation: pooled, never allocated per frame.
  const bx = new Float32Array(MAX_BUBBLES);
  const bx0 = new Float32Array(MAX_BUBBLES);
  const by = new Float32Array(MAX_BUBBLES);
  const br = new Float32Array(MAX_BUBBLES);
  const bph = new Float32Array(MAX_BUBBLES);
  let bubbles = 0;
  const px = new Float32Array(MAX_POPS);
  const pr = new Float32Array(MAX_POPS);
  const pa = new Float32Array(MAX_POPS);
  let pops = 0;
  const dx = new Float32Array(MAX_DROPS);
  const dy = new Float32Array(MAX_DROPS);
  const dv = new Float32Array(MAX_DROPS);
  let drops = 0;
  const collarX = new Float32Array(COLLAR);
  const collarR = new Float32Array(COLLAR);
  const collarRate = new Float32Array(COLLAR);
  const collarPh = new Float32Array(COLLAR);
  const widths = new Float32Array(VB_H + 1);
  for (let y = 0; y <= VB_H; y += 1) widths[y] = halfWidth(y);
  const hwAt = (y: number) => widths[clamp(Math.round(y), 0, VB_H)] ?? 0;

  let sites: Site[] = [];
  const bursts: Site[] = [];
  let rand = generator(1);
  let surface = surfaceOf(0.8);
  let liquid: Path2D | null = null;
  let siteKey = "";
  let time = 0;
  let sinceTop = 0;
  let collarBoost = 0;
  let popCount = 0;
  let fizzState: FluteBubblesFizz = "lively";

  const carbonation = () => {
    const c = cfg;
    if (!c || c.flatAfter <= 0) return 1;
    const tau = Math.max(1, c.flatAfter / 1000 / 3);
    return FLOOR + (1 - FLOOR) * Math.exp(-sinceTop / tau);
  };

  const spawn = (site: Site, carbon: number) => {
    const c = cfg;
    if (!c || bubbles >= MAX_BUBBLES) return;
    const i = bubbles;
    bubbles += 1;
    const jitter = (rand() - 0.5) * 0.5;
    bx0[i] = site.x + jitter;
    bx[i] = site.x + jitter;
    by[i] = site.y;
    // One site makes near-identical bubbles: a bigger one would rise faster
    // and catch the one ahead, so the string would bunch into pairs.
    br[i] =
      (0.3 + 0.36 * clamp(c.bubbleSize, 0, 1)) *
      (0.98 + 0.04 * rand()) *
      site.scale *
      (0.75 + 0.25 * carbon);
    bph[i] = site.sway + rand() * 0.4;
  };

  const remove = (i: number) => {
    const j = bubbles - 1;
    bx[i] = bx[j] ?? 0;
    bx0[i] = bx0[j] ?? 0;
    by[i] = by[j] ?? 0;
    br[i] = br[j] ?? 0;
    bph[i] = bph[j] ?? 0;
    bubbles = j;
  };

  const step = (dt: number, rehearsal = false) => {
    const c = cfg;
    if (!c) return;
    time += dt;
    // A rehearsal (the pre-roll) fills the streams without ageing the wine.
    if (!rehearsal) sinceTop += dt;
    collarBoost = Math.max(0, collarBoost - dt * 0.8);
    const carbon = carbonation();
    const fizz = clamp(c.fizz, 0, 1);
    const base = 4 + 12 * fizz;
    // Emission: the weakest points give up first as the wine goes flat.
    for (const site of sites) {
      if (site.strength < (1 - carbon) * 0.95) continue;
      site.acc += base * site.strength * (0.25 + 0.75 * carbon) * dt;
      while (site.acc >= 1) {
        site.acc -= 1;
        spawn(site, carbon);
      }
    }
    for (let k = bursts.length - 1; k >= 0; k -= 1) {
      const site = bursts[k];
      if (!site) continue;
      site.life -= dt;
      if (site.life <= 0) {
        bursts.splice(k, 1);
        continue;
      }
      site.acc += site.rate * dt;
      while (site.acc >= 1) {
        site.acc -= 1;
        spawn(site, 1);
      }
    }
    // Rise: speed follows size squared (Stokes), size grows with the climb.
    const grow =
      (0.0042 + 0.0046 * clamp(c.bubbleSize, 0, 1)) *
      (0.55 + 0.45 * carbon) *
      (0.85 + 0.3 * fizz);
    for (let i = bubbles - 1; i >= 0; i -= 1) {
      const r = br[i] ?? 0.4;
      const v = 9 + 28 * r * r;
      const rise = v * dt;
      const y = (by[i] ?? 0) - rise;
      by[i] = y;
      br[i] = r + grow * rise;
      bx[i] = (bx0[i] ?? CX) + 0.3 * Math.sin((bph[i] ?? 0) + y * 0.07);
      if (y <= surface + r * 0.4) {
        popCount += 1;
        if (pops < MAX_POPS) {
          px[pops] = bx[i] ?? CX;
          pr[pops] = r;
          pa[pops] = 0;
          pops += 1;
        }
        // One pop in four flicks a droplet up out of the wine.
        if (popCount % 4 === 0 && drops < MAX_DROPS) {
          dx[drops] = bx[i] ?? CX;
          dy[drops] = surface - 0.6;
          dv[drops] = -(16 + r * 9 + rand() * 6);
          drops += 1;
        }
        remove(i);
      }
    }
    for (let i = pops - 1; i >= 0; i -= 1) {
      const age = (pa[i] ?? 0) + dt;
      pa[i] = age;
      if (age > POP_LIFE) {
        const j = pops - 1;
        px[i] = px[j] ?? 0;
        pr[i] = pr[j] ?? 0;
        pa[i] = pa[j] ?? 0;
        pops = j;
      }
    }
    for (let i = drops - 1; i >= 0; i -= 1) {
      const v = (dv[i] ?? 0) + 260 * dt;
      dv[i] = v;
      const y = (dy[i] ?? 0) + v * dt;
      dy[i] = y;
      if (y > surface && v > 0) {
        const j = drops - 1;
        dx[i] = dx[j] ?? 0;
        dy[i] = dy[j] ?? 0;
        dv[i] = dv[j] ?? 0;
        drops = j;
      }
    }
    const state: FluteBubblesFizz =
      carbon > 0.55 ? "lively" : carbon > 0.22 ? "settling" : "flat";
    if (!rehearsal && state !== fizzState) {
      fizzState = state;
      report(state);
    }
  };

  const simulate = (seconds: number, rehearsal = false) => {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i += 1) step(STEP, rehearsal);
  };

  const layout = () => {
    const c = cfg;
    if (!c) return;
    surface = surfaceOf(c.fill);
    const top = hwAt(surface);
    for (let i = 0; i < COLLAR; i += 1) {
      const s = Math.round(c.seed);
      const u = hash(s, i, 11);
      const side = i % 2 === 0 ? 1 : -1;
      // Beads crowd the glass: most sit near the walls.
      collarX[i] = CX + side * (top - 0.9) * (1 - u * u * 0.92);
      collarR[i] = 0.35 + 0.55 * hash(s, i, 12);
      collarRate[i] = 0.4 + hash(s, i, 13) * 1.3;
      collarPh[i] = hash(s, i, 14);
    }
    liquid = new Path2D(winePath(surface, 0));
  };

  const rebuild = () => {
    const c = cfg;
    if (!c) return;
    const key = `${Math.round(c.streams)}|${c.seed}|${c.fill}`;
    if (key === siteKey) return;
    siteKey = key;
    layout();
    sites = sitesFor(c.streams, c.seed, surface);
    bubbles = 0;
    pops = 0;
    drops = 0;
    bursts.length = 0;
    rand = generator(Math.round(c.seed) * 7919 + 17);
    // Pre-roll, so the glass opens already fizzing rather than empty.
    simulate(4.5, true);
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || canvas.width < 2 || !liquid) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = scale * ratio;
    ctx.setTransform(k, 0, 0, k, ox * ratio, oy * ratio);
    const [rim, body, light, wine] = colours;
    const glint = clamp(c.glint, 0, 1);
    ctx.save();
    ctx.clip(liquid);
    // Bodies, then rims, then the highlight toward the light; bubbles inside
    // the refraction band down the left glint brighter.
    ctx.beginPath();
    for (let i = 0; i < bubbles; i += 1) {
      const x = bx[i] ?? 0;
      const y = by[i] ?? 0;
      const r = br[i] ?? 0;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fillStyle = body ?? "white";
    ctx.fill();
    ctx.lineWidth = Math.max(0.16, 0.5 / scale);
    ctx.strokeStyle = rim ?? "black";
    ctx.globalAlpha = 0.36;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = light ?? "white";
    // Two passes over the same pool rather than two paths per frame.
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.beginPath();
      for (let i = 0; i < bubbles; i += 1) {
        const x = bx[i] ?? 0;
        const y = by[i] ?? 0;
        const r = br[i] ?? 0;
        const hw = hwAt(y);
        const band = Math.abs(x - (CX - 0.5 * hw)) < 0.16 * hw;
        if (band !== (pass === 1)) continue;
        const hr = Math.max(0.2, r * 0.4);
        const hx = x - r * 0.3;
        const hy = y - r * 0.32;
        ctx.moveTo(hx + hr, hy);
        ctx.arc(hx, hy, hr, 0, TAU);
      }
      ctx.globalAlpha =
        pass === 0 ? 0.3 + 0.45 * glint : Math.min(1, 0.55 + 0.45 * glint);
      ctx.fill();
    }
    // The collar: fine beads at the glass, blinking on their own clocks.
    const carbon = carbonation();
    const duty = 0.45 + 0.35 * carbon + 0.2 * collarBoost;
    ctx.beginPath();
    for (let i = 0; i < COLLAR; i += 1) {
      const phase = (time * (collarRate[i] ?? 1) + (collarPh[i] ?? 0)) % 1;
      if (phase > duty) continue;
      const x = collarX[i] ?? CX;
      const r = (collarR[i] ?? 0.5) * (0.8 + 0.4 * collarBoost);
      const y = surface + 0.4 + r * 0.6;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.lineWidth = Math.max(0.14, 0.45 / scale);
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    // Pops: a ring opening at the surface.
    ctx.strokeStyle = light ?? "white";
    for (let i = 0; i < pops; i += 1) {
      const t = (pa[i] ?? 0) / POP_LIFE;
      const r = (pr[i] ?? 0.5) * (1 + 2.2 * t);
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.beginPath();
      ctx.ellipse(px[i] ?? CX, surface + 0.2, r, r * 0.42, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    // Droplets above the wine, inside the bowl.
    ctx.fillStyle = wine ?? "white";
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i < drops; i += 1) {
      const x = dx[i] ?? CX;
      const y = dy[i] ?? surface;
      ctx.moveTo(x + 0.45, y);
      ctx.arc(x, y, 0.45, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const running = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused);
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
    last = now;
    if (running()) {
      let left = dt;
      while (left > 1e-4) {
        const h = Math.min(STEP, left);
        step(h);
        left -= h;
      }
    }
    draw();
    if (running()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!running()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < colours.length; i += 1) {
      const el = kids[i];
      if (el) colours[i] = read(getComputedStyle(el).color);
    }
  };

  const resize = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!c || w < 1 || h < 1) return;
    ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    scale = Math.min(w / VB_W, h / VB_H);
    ox = (w - VB_W * scale) / 2;
    oy = (h - VB_H * scale) / 2;
    const cw = Math.max(1, Math.round(w * ratio));
    const ch = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    draw();
    kick();
  };

  const addBurst = (
    side: FluteBubblesSide,
    y0: number,
    count: number,
    rate: number,
  ) => {
    for (let i = 0; i < count && bursts.length < MAX_BURST; i += 1) {
      let x: number;
      let y: number;
      if (side === "point") {
        y = BOTTOM - 3 - rand() * 16;
        x = CX + (rand() - 0.5) * Math.min(8, hwAt(y) * 1.4);
      } else {
        y = clamp(y0 + (rand() - 0.5) * 48, surface + 24, BOTTOM - 8);
        const sign = side === "left" ? -1 : 1;
        x = CX + sign * (hwAt(y) - 1.1) * (0.9 + rand() * 0.08);
      }
      bursts.push({
        x,
        y,
        strength: 1,
        sway: rand() * TAU,
        acc: rand(),
        life: 1.2 + rand() * 0.8,
        rate: rate * (0.8 + rand() * 0.4),
        scale: 0.7 + rand() * 0.2,
      });
    }
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) readColours();
      rebuild();
      if (was && was.colorKey !== next.colorKey) readColours();
      if (was && was.dpr !== next.dpr) {
        resize();
        return;
      }
      if (!was) {
        resize();
        return;
      }
      draw();
      kick();
    },
    tap(x, y) {
      const c = cfg;
      if (!c) return "point";
      let side: FluteBubblesSide;
      if (y > BOTTOM - 6) side = "point";
      else side = x < CX ? "left" : "right";
      const y0 = y > surface + 20 && y < BOTTOM ? y : (surface + BOTTOM) / 2;
      const b = clamp(c.burst, 0, 1);
      addBurst(side, y0, Math.round(3 + b * 11), 14 + 16 * b);
      collarBoost = 1;
      if (!running()) {
        // A still glass shows the fresh streams frozen mid-rush; a paused
        // one holds everything where it is until it plays again.
        if (!c.paused) simulate(1);
        draw();
      } else kick();
      return side;
    },
    topUp() {
      sinceTop = 0;
      collarBoost = 1;
      addBurst("point", BOTTOM, 6, 24);
      addBurst("left", (surface + BOTTOM) / 2, 4, 18);
      addBurst("right", (surface + BOTTOM) / 2, 4, 18);
      if (fizzState !== "lively") {
        fizzState = "lively";
        report("lively");
      }
      if (!running()) {
        if (cfg && !cfg.paused) simulate(1);
        draw();
      } else kick();
    },
    settle() {
      if (running() || !cfg || cfg.paused || !bursts.length) return;
      simulate(2.2);
      draw();
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
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

/** The server's still: each stream as its string of pearls, frozen mid-rise. */
function stillBubbles(
  streams: number,
  seed: number,
  fill: number,
  size: number,
) {
  const surface = surfaceOf(fill);
  const out: { x: number; y: number; r: number }[] = [];
  for (const site of sitesFor(streams, seed, surface)) {
    let y = site.y;
    let r = (0.3 + 0.36 * clamp(size, 0, 1)) * site.scale;
    let k = 0;
    while (y > surface + 2 && k < 40) {
      out.push({
        x: r2(site.x + 0.3 * Math.sin(site.sway + y * 0.07)),
        y: r2(y),
        r: r2(r),
      });
      const gap = (9 + 28 * r * r) / (10 * site.strength);
      y -= gap;
      r += 0.0065 * gap;
      k += 1;
    }
  }
  return out;
}

const SIDE_WORDS: Record<FluteBubblesSide, string> = {
  left: "the left wall",
  right: "the right wall",
  point: "the point of the bowl",
};

/**
 * A tall flute of sparkling wine, side-on. Fine bubbles rise in steady strings
 * from points on the glass — born tiny, growing as they climb and quickening
 * with their size (rise speed goes with size squared) — catch the light on
 * their way up and pop at the surface in a small ring, now and then flicking
 * a droplet above the wine, while a collar of beads blinks against the glass.
 *
 * Tapping the glass shivers its surface on springs.recoil and releases a burst
 * of fresh streams from the wall nearest the press. Left alone the wine slowly
 * goes flat — fewer, smaller, lazier streams — until the Top up button pours:
 * a thin stream falls in, a mousse swells on springs.glide and settles, and
 * the fizz is back. The glass and Top up are real buttons; Space and Enter
 * reach both. Bubbles are a 2D canvas over crisp SVG glass, run only on
 * screen; under reduced motion the glass is a still photograph of its streams.
 */
export function FluteBubbles({
  streams = 7,
  fizz = 0.6,
  tint = "straw",
  liquidColor,
  fill = 0.8,
  bubbleSize = 0.5,
  glint = 0.7,
  burst = 0.6,
  flatAfter = 45000,
  mousse = true,
  onTap,
  onTopUp,
  onFizzChange,
  sound = false,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Glass of sparkling wine",
  disabled = false,
  className,
}: FluteBubblesProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const wineId = `${uid}-wine`;
  const bandId = `${uid}-band`;
  const edgeId = `${uid}-edge`;
  const clipId = `${uid}-clip`;
  const foamId = `${uid}-foam`;
  const hintId = `${uid}-hint`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const loop = React.useRef<LoopHandle | null>(null);
  const loopTimers = React.useRef<number[]>([]);
  const keyTaps = React.useRef(0);
  const [spoken, setSpoken] = React.useState("");

  const palette = TINTS[tint] ?? TINTS.straw;
  const top = liquidColor ?? palette.top;
  const deep = liquidColor
    ? `oklch(from ${liquidColor} calc(l * 0.84) calc(c * 1.25) h)`
    : palette.deep;
  const surface = surfaceOf(fill);

  const shiver = useMotionValue(0);
  const foam = useMotionValue(0);
  const pourTop = useMotionValue(-4);
  const pourEnd = useMotionValue(-4);
  const wineD = useTransform(shiver, (a) => winePath(surface, r2(a)));
  const meniscusD = useTransform(shiver, (a) => {
    const w = halfWidth(surface);
    const parts: string[] = [];
    for (let i = 0; i <= 16; i += 1) {
      const x = CX - w + (2 * w * i) / 16;
      const edge = Math.sin((Math.PI * i) / 16);
      const y = surface + a * 2.2 * edge * Math.sin(i * 1.9 + 0.6);
      parts.push(`${i === 0 ? "M" : "L"} ${r2(x)} ${r2(y)}`);
    }
    return parts.join(" ");
  });
  const foamD = useTransform(foam, (m) => {
    const w = halfWidth(surface) - 0.2;
    if (m < 0.2) return "";
    const parts: string[] = [`M ${r2(CX - w)} ${r2(surface + 1)}`];
    for (let i = 0; i <= 14; i += 1) {
      const u = i / 14;
      const x = CX - w + 2 * w * u;
      const dome = Math.pow(Math.sin(Math.PI * u), 0.45);
      const bumps = 0.6 * Math.sin(u * 23 + 1.3) * Math.min(1, m / 8);
      parts.push(`L ${r2(x)} ${r2(surface - m * dome - bumps)}`);
    }
    parts.push(`L ${r2(CX + w)} ${r2(surface + 1)} Z`);
    return parts.join(" ");
  });
  const foamOpacity = useTransform(foam, (m) => r2(clamp(m / 6, 0, 1)));
  const pourY = useTransform(pourTop, (v) => r2(v));
  const pourH = useTransform([pourTop, pourEnd], ([t, e]) =>
    r2(Math.max(0, (e as number) - (t as number))),
  );

  const config: Config = {
    streams,
    fizz,
    fill,
    bubbleSize,
    glint,
    burst,
    flatAfter,
    seed,
    dpr,
    paused,
    motionSafe,
    colorKey: `${top}|${deep}`,
  };
  const latest = React.useRef(config);
  const callbacks = React.useRef({ onFizzChange });

  React.useEffect(() => {
    latest.current = config;
    callbacks.current = { onFizzChange };
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, (state) => {
      if (state === "flat") setSpoken("The glass has gone flat.");
      callbacks.current.onFizzChange?.(state);
    });
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

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const hush = React.useCallback(() => {
    for (const t of loopTimers.current) window.clearTimeout(t);
    loopTimers.current = [];
    loop.current?.stop();
    loop.current = null;
  }, []);

  React.useEffect(
    () => () => {
      halt();
      hush();
    },
    [halt, hush],
  );

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

  /** A fizz the visitor asked for: in, held, glided down and always stopped. */
  const sizzle = (gain: number, pitch: number, length: number, pan: number) => {
    hush();
    const handle = audio.start("sizzle", { gain, pitch, pan });
    loop.current = handle;
    loopTimers.current = [
      window.setTimeout(() => handle.set({ gain: gain * 0.4 }), length * 0.45),
      window.setTimeout(() => {
        handle.stop();
        if (loop.current === handle) loop.current = null;
      }, length),
    ];
  };

  const tapAt = (x: number, y: number, clientX: number | null) => {
    if (disabled) return;
    const e = engine.current;
    const side = e ? e.tap(x, y) : x < CX ? "left" : "right";
    if (motionSafe) {
      // Reset with jump() so the spring does not read the reset as velocity.
      shiver.jump(1);
      running.current.push(
        animate(shiver, 0, { ...springs.recoil, velocity: 0 }),
      );
    } else {
      timers.current.push(
        window.setTimeout(() => engine.current?.settle(), 2000),
      );
    }
    const root = rootRef.current;
    const pan =
      clientX === null || !root
        ? side === "left"
          ? -0.3
          : side === "right"
            ? 0.3
            : 0
        : panFrom(clientX, root);
    sizzle(0.3 + 0.25 * clamp(burst, 0, 1), 1.12, 1400, pan);
    setSpoken(`Fresh streams from ${SIDE_WORDS[side]}.`);
    onTap?.(side);
  };

  const toBox = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: CX, y: (surface + BOTTOM) / 2 };
    const r = root.getBoundingClientRect();
    const s = Math.min(r.width / VB_W, r.height / VB_H) || 1;
    return {
      x: (clientX - r.left - (r.width - VB_W * s) / 2) / s,
      y: (clientY - r.top - (r.height - VB_H * s) / 2) / s,
    };
  };

  const topUp = () => {
    if (disabled) return;
    halt();
    engine.current?.topUp();
    sizzle(0.55, 0.92, 2400, 0);
    setSpoken("Topped up. The wine is lively again.");
    onTopUp?.();
    const head = mousse
      ? MOUSSE * (0.7 + 0.3 * (1 - clamp(fill, 0.5, 0.92)))
      : 0;
    if (!motionSafe) {
      foam.jump(head);
      pourTop.jump(-4);
      pourEnd.jump(-4);
      timers.current = [
        window.setTimeout(() => {
          foam.jump(0);
          engine.current?.settle();
        }, 2400),
      ];
      return;
    }
    pourTop.jump(-4);
    pourEnd.jump(-4);
    const fall = { duration: 0.28, ease: easings.exit };
    running.current = [animate(pourEnd, surface + 2, fall)];
    timers.current = [
      window.setTimeout(() => {
        if (head > 0) running.current.push(animate(foam, head, springs.glide));
        shiver.jump(0.7);
        running.current.push(
          animate(shiver, 0, { ...springs.recoil, velocity: 0 }),
        );
      }, 260),
      window.setTimeout(() => {
        running.current.push(
          animate(pourTop, surface + 2, {
            duration: durations.slow * 0.7,
            ease: easings.exit,
          }),
        );
      }, 820),
      window.setTimeout(() => {
        // Foam settles slowly: a long ease, not a spring — nothing bounces down.
        running.current.push(
          animate(foam, 0, { duration: 2.4, ease: easings.move }),
        );
      }, 1100),
    ];
  };

  const bubblesStill = stillBubbles(streams, seed, fill, bubbleSize);
  const topW = halfWidth(surface);

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/flute-bubbles [container-type:size] relative isolate select-none",
        className ?? "h-[30rem] w-full",
      )}
      style={{
        ["--fb-s" as string]: "min(calc(100cqw / 160), calc(100cqh / 460))",
      }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <defs>
          <linearGradient
            id={wineId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            x2="0"
            y1={surface}
            y2={BOTTOM}
          >
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={deep} />
          </linearGradient>
          <linearGradient
            id={bandId}
            gradientUnits="userSpaceOnUse"
            x1={CX - 34}
            x2={CX + 34}
            y1="0"
            y2="0"
          >
            <stop offset="0" stopColor={HIGHLIGHT} stopOpacity={0} />
            <stop offset="0.16" stopColor={HIGHLIGHT} stopOpacity={0.34} />
            <stop offset="0.3" stopColor={HIGHLIGHT} stopOpacity={0} />
            <stop offset="0.84" stopColor={HIGHLIGHT} stopOpacity={0} />
            <stop offset="0.92" stopColor={HIGHLIGHT} stopOpacity={0.14} />
            <stop offset="1" stopColor={HIGHLIGHT} stopOpacity={0} />
          </linearGradient>
          <linearGradient
            id={edgeId}
            gradientUnits="userSpaceOnUse"
            x1={CX - 33}
            x2={CX + 33}
            y1="0"
            y2="0"
          >
            <stop offset="0" stopColor={deep} stopOpacity={0.7} />
            <stop offset="0.14" stopColor={deep} stopOpacity={0} />
            <stop offset="0.86" stopColor={deep} stopOpacity={0} />
            <stop offset="1" stopColor={deep} stopOpacity={0.6} />
          </linearGradient>
          <clipPath id={clipId}>
            <path d={winePath(surface, 0)} />
          </clipPath>
          <linearGradient id={foamId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={HIGHLIGHT} />
            <stop offset="1" stopColor={top} />
          </linearGradient>
        </defs>
        {/* The glass's body, faintly there behind the wine. */}
        <path d={OUTER} fill={GLASS_BODY} />
        <ellipse
          cx={CX}
          cy={RIM}
          rx={r2(halfWidth(RIM) + GLASS / 2)}
          ry={3}
          fill="none"
          stroke={GLASS_EDGE}
          strokeWidth={0.6}
          strokeOpacity={0.5}
        />
        <motion.path d={wineD} fill={`url(#${wineId})`} />
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={CX - 36}
            y={surface - 4}
            width={72}
            height={BOTTOM - surface + 6}
            fill={`url(#${edgeId})`}
          />
          <rect
            x={CX - 36}
            y={surface - 4}
            width={72}
            height={BOTTOM - surface + 6}
            fill={`url(#${bandId})`}
          />
          <g className="group-data-live/flute-bubbles:hidden">
            {bubblesStill.map((b, i) => (
              <circle
                key={i}
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill={HIGHLIGHT}
                fillOpacity={0.55}
                stroke={deep}
                strokeOpacity={0.5}
                strokeWidth={0.2}
              />
            ))}
          </g>
        </g>
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/flute-bubbles:opacity-100"
      />
      <svg
        aria-hidden
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full"
      >
        {/* The pour: a thin stream falling from above the rim. */}
        <motion.rect
          x={CX + 4}
          width={1.8}
          rx={0.9}
          y={pourY}
          height={pourH}
          fill={top}
        />
        <motion.path
          d={foamD}
          fill={`url(#${foamId})`}
          style={{ opacity: foamOpacity }}
        />
        <motion.path
          d={meniscusD}
          fill="none"
          stroke={HIGHLIGHT}
          strokeOpacity={0.75}
          strokeWidth={0.6}
        />
        <ellipse
          cx={CX}
          cy={surface}
          rx={r2(topW)}
          ry={1.6}
          fill="none"
          stroke={deep}
          strokeOpacity={0.35}
          strokeWidth={0.4}
        />
        {/* The glass: outline, the inner wall, the rim's front, the foot. */}
        <path d={OUTER} fill="none" stroke={GLASS_EDGE} strokeWidth={0.8} />
        <path
          d={INNER}
          fill="none"
          stroke={GLASS_EDGE}
          strokeOpacity={0.45}
          strokeWidth={0.4}
        />
        <path
          d={`M ${r2(CX - halfWidth(RIM) - GLASS / 2)} ${RIM} A ${r2(halfWidth(RIM) + GLASS / 2)} 3 0 0 0 ${r2(CX + halfWidth(RIM) + GLASS / 2)} ${RIM}`}
          fill="none"
          stroke={GLASS_EDGE}
          strokeWidth={0.9}
        />
        <path
          d={reflection(-0.74, RIM + 18, RIM + BOWL * 0.78)}
          fill="none"
          stroke={GLASS_SHINE}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <path
          d={reflection(-0.58, RIM + 30, RIM + BOWL * 0.5)}
          fill="none"
          stroke={GLASS_SHINE}
          strokeOpacity={0.5}
          strokeWidth={0.7}
          strokeLinecap="round"
        />
        <path
          d={reflection(0.8, RIM + 26, RIM + BOWL * 0.62)}
          fill="none"
          stroke={GLASS_SHINE}
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeLinecap="round"
        />
        <rect
          x={CX - 1}
          y={BOTTOM + 26}
          width={0.8}
          height={92}
          fill={GLASS_SHINE}
          opacity={0.7}
        />
        <ellipse
          cx={CX}
          cy={438}
          rx={48}
          ry={7}
          fill={GLASS_BODY}
          stroke={GLASS_EDGE}
          strokeWidth={0.8}
        />
        <path
          d={`M ${CX - 40} 440.5 Q ${CX} 446 ${CX + 40} 440.5`}
          fill="none"
          stroke={GLASS_SHINE}
          strokeOpacity={0.7}
          strokeWidth={0.9}
          strokeLinecap="round"
        />
      </svg>
      <button
        type="button"
        aria-label={`${label}: tap the glass`}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          const p = toBox(event.clientX, event.clientY);
          tapAt(p.x, p.y, event.clientX);
        }}
        onClick={(event) => {
          // Space, Enter and assistive technology arrive as a click with no
          // pointer behind it; they tap the walls in turn.
          if (event.detail !== 0) return;
          keyTaps.current += 1;
          const n = keyTaps.current;
          const y =
            surface +
            (BOTTOM - surface) * (0.35 + 0.4 * hash(Math.round(seed), n, 21));
          tapAt(
            n % 3 === 0 ? CX : n % 2 === 0 ? CX + 20 : CX - 20,
            n % 3 === 0 ? BOTTOM : y,
            null,
          );
        }}
        className={cn(
          "absolute touch-manipulation rounded-4 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          left: "calc(50% - var(--fb-s) * 50)",
          top: "calc(50% - var(--fb-s) * 216)",
          width: "calc(var(--fb-s) * 100)",
          height: "calc(var(--fb-s) * 436)",
        }}
      />
      <button
        type="button"
        aria-disabled={disabled || undefined}
        onClick={() => topUp()}
        className={cn(
          "absolute top-1 right-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-card/85 px-3 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors",
          "hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        )}
      >
        <Wine aria-hidden className="size-3.5 shrink-0 text-ink-2" />
        Top up
      </button>
      <p id={hintId} className="sr-only">
        Tap the glass to release fresh streams of bubbles from its wall. The
        wine slowly goes flat; Top up pours more.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {spoken}
      </p>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[
          `oklch(from ${deep} calc(l * 0.72) c h / 0.8)`,
          `oklch(from ${top} calc(l + 0.06) calc(c * 0.4) h / 0.5)`,
          HIGHLIGHT,
          top,
        ].map((c, i) => (
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
