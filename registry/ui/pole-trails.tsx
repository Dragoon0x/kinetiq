"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PoleTrailsHorizon = "ridge" | "hills" | "pines" | "sea";
export type PoleTrailsPole = readonly [number, number];

export type PoleTrailsProps = {
  /** How fast the exposure builds, in minutes of sky per second of real time (1 to 60): the arcs grow 0.25° a second per unit. @default 10 */
  exposure?: number;
  /** How many stars, 0 (a hazy night) to 1 (a dark-sky site). @default 0.5 */
  density?: number;
  /** The ground under the sky: a jagged ridge, rolling hills, a hill with a treeline of pines, or a flat sea horizon. @default "ridge" */
  horizon?: PoleTrailsHorizon;
  /** Hours of sky an exposure gathers before it holds (1 to 12): 6 hours is a quarter turn. @default 6 */
  maxHours?: number;
  /** A finished exposure closes the shutter and starts a fresh one after `hold`. @default true */
  loop?: boolean;
  /** How long a finished exposure is held before it loops, ms. @default 5000 */
  hold?: number;
  /** Meteors per minute of real time while the shutter is open; 0 for none. @default 4 */
  meteors?: number;
  /** The celestial pole as fractions of the frame, [x, y] (controlled). */
  pole?: PoleTrailsPole;
  /** Where the pole starts when uncontrolled; Home returns it here. @default [0.64, 0.3] */
  defaultPole?: PoleTrailsPole;
  /** Fires from the drag release or the key that moved the pole, with where it lands. */
  onPoleChange?: (pole: [number, number]) => void;
  /** The night sky, any CSS colour. A pigment at fixed lightness, so the print reads the same in both themes. @default "oklch(from var(--accent) 0.19 0.055 h)" */
  skyColor?: string;
  /** The ridge silhouette, any CSS colour. @default "oklch(from var(--accent) 0.085 0.018 h)" */
  groundColor?: string;
  /** Star tints [hot, neutral, cool], each a CSS colour; every star sits somewhere between them by its temperature. */
  starColors?: readonly [string, string, string];
  /** Skyglow along the horizon, 0 to 1; it gathers as the exposure builds. @default 0.5 */
  glow?: number;
  /** Drag moves the pole; a click, Enter or Space closes the shutter. @default true */
  interactive?: boolean;
  /** Holds the exposure where it is. @default false */
  paused?: boolean;
  /** Seeds the stars, the ridge and the meteors. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A fresh exposure opened (the shutter closed and reopened). */
  onShutter?: () => void;
  /** The exposure reached `maxHours`, with the hours gathered. */
  onComplete?: (hours: number) => void;
  /** The sky's name; the button reads "<label>: start a new exposure". @default "Night sky" */
  label?: string;
  /** No drag, no shutter: the exposure keeps running and the button is aria-disabled. @default false */
  disabled?: boolean;
  /** Sizes and shapes the frame. @default "h-56 w-full" */
  className?: string;
};

const DEFAULT_POLE: PoleTrailsPole = [0.64, 0.3];
const DEFAULT_SKY = "oklch(from var(--accent) 0.19 0.055 h)";
const DEFAULT_GROUND = "oklch(from var(--accent) 0.085 0.018 h)";
const DEFAULT_STARS = [
  "oklch(from var(--accent-bright) 0.88 0.05 calc(h - 25))",
  "oklch(from var(--accent-bright) 0.97 0.012 h)",
  "oklch(from var(--warn) 0.88 0.06 calc(h - 22))",
] as const;
/** The corner readout sits on the print, which is dark in both themes. */
const READOUT = "oklch(from var(--accent-bright) 0.93 0.02 h / 0.62)";

/** Where the pole may go, as fractions of the frame. */
const POLE_X: [number, number] = [0.06, 0.94];
const POLE_Y: [number, number] = [0.05, 0.72];
/** The sky turns 15° an hour. */
const RAD_PER_HOUR = (15 * Math.PI) / 180;
const MAX_METEORS = 8;
const SUB = 1 / 240;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r1 = (v: number) => Math.round(v * 10) / 10;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clampPole = (p: PoleTrailsPole): [number, number] => [
  r3(clamp(p[0], POLE_X[0], POLE_X[1])),
  r3(clamp(p[1], POLE_Y[0], POLE_Y[1])),
];

const hoursText = (hours: number) => {
  const total = Math.floor(hours * 60 + 1e-6);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
};

/**
 * The ground line as fractions of the frame's height, sampled at `n + 1`
 * points across. Shared by the canvas and the server's still, so the ridge a
 * reader sees before the canvas starts is the ridge it becomes.
 */
function profile(horizon: PoleTrailsHorizon, seed: number, n = 128) {
  const rand = lcg(seed * 53 + 11);
  const ys = new Float32Array(n + 1);
  if (horizon === "ridge") {
    // Midpoint displacement: each halving adds detail at a smaller scale,
    // which is what makes a ridge read as rock rather than as a wave.
    ys[0] = 0.72 + rand() * 0.1;
    ys[n] = 0.76 + rand() * 0.1;
    let step = n;
    let amp = 0.2;
    while (step > 1) {
      const half = step / 2;
      for (let i = half; i < n; i += step) {
        const a = ys[i - half] ?? 0.8;
        const b = ys[i + half] ?? 0.8;
        ys[i] = (a + b) / 2 + (rand() - 0.5) * amp;
      }
      step = half;
      amp *= 0.6;
    }
    // One summit, off-centre, so the composition has a heaviest point.
    const peak = 0.18 + rand() * 0.24;
    for (let i = 0; i <= n; i += 1) {
      const x = i / n;
      const bump = Math.exp(-Math.pow((x - peak) / 0.13, 2)) * 0.12;
      ys[i] = clamp((ys[i] ?? 0.8) - bump, 0.5, 0.94);
    }
    return ys;
  }
  if (horizon === "sea") {
    // A flat horizon with one distant headland, low on the left.
    const at = 0.06 + rand() * 0.1;
    for (let i = 0; i <= n; i += 1) {
      const x = i / n;
      const land =
        Math.exp(-Math.pow((x - at) / 0.09, 2)) * 0.038 +
        Math.exp(-Math.pow((x - at - 0.07) / 0.05, 2)) * 0.016;
      ys[i] = 0.8 - land;
    }
    return ys;
  }
  const base = horizon === "pines" ? 0.85 : 0.8;
  const a1 = horizon === "pines" ? 0.032 : 0.05;
  const p1 = rand();
  const p2 = rand();
  const p3 = rand();
  for (let i = 0; i <= n; i += 1) {
    const x = i / n;
    ys[i] =
      base +
      a1 * Math.sin(2 * Math.PI * (1.05 * x + p1)) +
      a1 * 0.6 * Math.sin(2 * Math.PI * (2.3 * x + p2)) +
      0.012 * Math.sin(2 * Math.PI * (6.1 * x + p3));
  }
  return ys;
}

type Config = {
  exposure: number;
  density: number;
  horizon: PoleTrailsHorizon;
  maxHours: number;
  loop: boolean;
  hold: number;
  meteors: number;
  glow: number;
  paused: boolean;
  seed: number;
  dpr: number;
  poleX: number;
  poleY: number;
  colorKey: string;
  motionSafe: boolean;
};

type Phase = "exposing" | "complete" | "closing" | "closed" | "opening";

type Meteor = {
  /** Start, relative to the pole, px. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
  born: number;
  dur: number;
  bright: number;
};

type Events = {
  shutter: (byVisitor: boolean) => void;
  complete: (hours: number, byVisitor: boolean) => void;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  shutter: (byVisitor: boolean) => void;
  pole: () => [number, number];
  grab: () => void;
  dragTo: (x: number, y: number) => void;
  release: (x: number, y: number, vx: number, vy: number) => void;
  dispose: () => void;
};

type SpringState = { v: number; w: number };
type SpringConst = { stiffness: number; damping: number; mass: number };

function stepSpring(
  s: SpringState,
  target: number,
  k: SpringConst,
  dt: number,
) {
  let left = dt;
  while (left > 0) {
    const h = Math.min(SUB, left);
    left -= h;
    s.w += ((-k.stiffness * (s.v - target) - k.damping * s.w) / k.mass) * h;
    s.v += s.w * h;
  }
}

/** Brightness classes: width, alpha, and the soft underlay of the bright ones. */
const WIDTH = [0.5, 0.7, 0.95, 1.3];
const ALPHA = [0.3, 0.46, 0.66, 0.9];
const HALO_WIDTH = [0, 0, 2.6, 4];
const HALO_ALPHA = [0, 0, 0.04, 0.08];
const BUCKETS = 12;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  readout: HTMLSpanElement | null,
  visible: React.RefObject<boolean>,
  events: React.RefObject<Events>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let holdTimer = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let disposed = false;
  // Colours, resolved from the carriers.
  let sky = "black";
  let deep = "black";
  let ground = "black";
  let glowInk = "black";
  let rim = "white";
  let stars = ["white", "white", "white"];
  // Cached layers.
  let skyFill: CanvasGradient | null = null;
  const glowLayer = document.createElement("canvas");
  const groundLayer = document.createElement("canvas");
  const sprite = document.createElement("canvas");
  // Stars, sorted into brightness × temperature buckets.
  let sr = new Float32Array(0);
  let sa = new Float32Array(0);
  let sc = new Float32Array(0);
  let ss = new Float32Array(0);
  const bucketStart = new Int32Array(BUCKETS + 1);
  // The exposure.
  let phase: Phase = "exposing";
  let hours = 0;
  let shownMinute = -1;
  let byVisitor = false;
  let exposures = 0;
  let closedAt = 0;
  const curtain: SpringState = { v: 0, w: 0 };
  let fade = 0;
  const meteors: Meteor[] = Array.from({ length: MAX_METEORS }, () => ({
    x: 0,
    y: 0,
    dx: 1,
    dy: 0,
    len: 0,
    born: 0,
    dur: 0.35,
    bright: 1,
  }));
  let meteorCount = 0;
  let rand = lcg(7);
  let radiant = { x: 0, y: 0 };
  // The pole, in px, with its spring.
  const px: SpringState = { v: 0, w: 0 };
  const py: SpringState = { v: 0, w: 0 };
  let aimX = 0;
  let aimY = 0;
  let dragging = false;
  let gliding = false;

  const read = (k: number, fallback: string) => {
    const el = carriers[k];
    return el ? getComputedStyle(el).color || fallback : fallback;
  };

  const readColours = () => {
    sky = read(0, sky);
    deep = read(1, deep);
    ground = read(2, ground);
    glowInk = read(3, glowInk);
    rim = read(4, rim);
    stars = [read(5, "white"), read(6, "white"), read(7, "white")];
    buildLayers();
  };

  const buildLayers = () => {
    const c = cfg;
    if (!c || !ctx || w < 1 || h < 1) return;
    const ys = profile(c.horizon, c.seed);
    const n = ys.length - 1;
    const yAt = (x: number) => {
      const f = clamp(x / w, 0, 1) * n;
      const i = Math.floor(f);
      const a = ys[i] ?? 0.8;
      const b = ys[Math.min(n, i + 1)] ?? a;
      return (a + (b - a) * (f - i)) * h;
    };
    let lowest = h;
    for (let i = 0; i <= n; i += 1) lowest = Math.min(lowest, (ys[i] ?? 1) * h);
    const horizonY = (ys[Math.round(n / 2)] ?? 0.8) * h;

    // The sky: deep at the zenith, the sky colour lower down.
    skyFill = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyFill.addColorStop(0, deep);
    skyFill.addColorStop(0.65, sky);
    skyFill.addColorStop(1, sky);

    // Skyglow, drawn at full strength once and laid on with an alpha that
    // grows with the exposure, so no gradient is built per frame.
    for (const layer of [glowLayer, groundLayer]) {
      layer.width = Math.max(1, Math.round(w * dpr));
      layer.height = Math.max(1, Math.round(h * dpr));
    }
    const g = glowLayer.getContext("2d");
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const top = Math.max(0, lowest - h * 0.55);
      const grad = g.createLinearGradient(0, top, 0, horizonY + 4);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, glowInk);
      g.fillStyle = grad;
      g.fillRect(0, top, w, h - top);
    }

    const gc = groundLayer.getContext("2d");
    if (gc) {
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      gc.clearRect(0, 0, w, h);
      gc.beginPath();
      gc.moveTo(0, h);
      const steps = Math.max(32, Math.round(w / 3));
      for (let i = 0; i <= steps; i += 1) {
        const x = (i / steps) * w;
        gc.lineTo(x, yAt(x));
      }
      gc.lineTo(w, h);
      gc.closePath();
      if (c.horizon === "sea") {
        // Water holds a little of the sky: lighter at the horizon, black
        // toward the shore.
        const water = gc.createLinearGradient(0, horizonY, 0, h);
        water.addColorStop(0, glowInk);
        water.addColorStop(0.18, ground);
        water.addColorStop(1, ground);
        gc.fillStyle = water;
        gc.fill();
        // The headland stays solid ground in front of the water.
        gc.fillStyle = ground;
        gc.beginPath();
        gc.moveTo(0, horizonY + 0.5);
        for (let i = 0; i <= steps; i += 1) {
          const x = (i / steps) * w;
          gc.lineTo(x, Math.min(horizonY + 0.5, yAt(x)));
        }
        gc.lineTo(w, horizonY + 0.5);
        gc.closePath();
        gc.fill();
        // A shimmer of the sky on the swell.
        const r = lcg(c.seed * 71 + 3);
        gc.strokeStyle = rim;
        gc.lineCap = "round";
        for (let k = 0; k < 26; k += 1) {
          const depth = Math.pow(r(), 1.6);
          const y = horizonY + 3 + depth * (h - horizonY - 6);
          const x = r() * w;
          const len = (6 + r() * 26) * (1 - depth * 0.5);
          gc.globalAlpha = 0.16 * (1 - depth);
          gc.lineWidth = 0.6 + depth * 0.6;
          gc.beginPath();
          gc.moveTo(x, y);
          gc.lineTo(x + len, y);
          gc.stroke();
        }
        gc.globalAlpha = 1;
      } else {
        gc.fillStyle = ground;
        gc.fill();
        // The rim: a hairline of skyglow where the ground meets the sky.
        gc.strokeStyle = rim;
        gc.globalAlpha = 0.32;
        gc.lineWidth = 0.8;
        gc.beginPath();
        for (let i = 0; i <= steps; i += 1) {
          const x = (i / steps) * w;
          if (i === 0) gc.moveTo(x, yAt(x));
          else gc.lineTo(x, yAt(x));
        }
        gc.stroke();
        gc.globalAlpha = 1;
      }
      if (c.horizon === "pines") {
        // A treeline in stands and clearings: each pine three tiers deep.
        const r = lcg(c.seed * 97 + 5);
        gc.fillStyle = ground;
        let x = -4;
        while (x < w + 4) {
          const stand =
            Math.sin(x * 0.011 + c.seed) * 0.5 + Math.sin(x * 0.027) * 0.5;
          if (stand > -0.35) {
            const tall = (9 + r() * 14) * (0.7 + 0.3 * stand) * (h / 232);
            const base = yAt(x) + 2;
            gc.beginPath();
            for (let t = 0; t < 3; t += 1) {
              const top = base - tall * (1 - t * 0.27);
              const width = tall * (0.22 + t * 0.09);
              const bottom = base - tall * (0.42 - t * 0.21);
              gc.moveTo(x, top);
              gc.lineTo(x + width, bottom);
              gc.lineTo(x - width, bottom);
              gc.closePath();
            }
            gc.rect(x - 0.6, base - tall * 0.25, 1.2, tall * 0.3);
            gc.fill();
          }
          x += 4 + r() * 8;
        }
      }
    }

    // A soft glow for a burning meteor's head.
    const size = Math.max(4, Math.round(12 * dpr));
    sprite.width = size;
    sprite.height = size;
    const sp = sprite.getContext("2d");
    if (sp) {
      const grad = sp.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      grad.addColorStop(0, stars[1] ?? "white");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      sp.clearRect(0, 0, size, size);
      sp.fillStyle = grad;
      sp.fillRect(0, 0, size, size);
    }
  };

  const buildStars = () => {
    const c = cfg;
    if (!c || w < 1 || h < 1) return;
    const area = w * h;
    const R = Math.hypot(w, h) * 1.02;
    // Uniform in a disc round the pole that covers the frame from anywhere the
    // pole can go; the count is set by how many should land in view.
    const inView = ((0.12 + 0.88 * clamp(c.density, 0, 1)) * area) / 430;
    const n = Math.min(3600, Math.round((inView * Math.PI * R * R) / area) + 1);
    const rand2 = lcg(c.seed * 131 + 17);
    const tr = new Float32Array(n);
    const ta = new Float32Array(n);
    const tb = new Uint8Array(n);
    const counts = new Int32Array(BUCKETS);
    for (let i = 0; i < n; i += 1) {
      // The first star is the pole star: bright, a few pixels off the pole,
      // drawing the smallest circle in the picture.
      const radius = i === 0 ? Math.max(3, h * 0.014) : R * Math.sqrt(rand2());
      const angle = rand2() * Math.PI * 2;
      // Magnitude: a power law, many faint and a few bright.
      const bright = i === 0 ? 1 : Math.pow(rand2(), 2.6);
      const bi = bright > 0.8 ? 3 : bright > 0.42 ? 2 : bright > 0.14 ? 1 : 0;
      const temp = i === 0 ? 0.5 : rand2();
      const ti = temp < 0.26 ? 0 : temp < 0.76 ? 1 : 2;
      const bucket = bi * 3 + ti;
      tr[i] = radius;
      ta[i] = angle;
      tb[i] = bucket;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    bucketStart[0] = 0;
    for (let b = 0; b < BUCKETS; b += 1) {
      bucketStart[b + 1] = (bucketStart[b] ?? 0) + (counts[b] ?? 0);
    }
    const fill = Int32Array.from(bucketStart.subarray(0, BUCKETS));
    sr = new Float32Array(n);
    sa = new Float32Array(n);
    sc = new Float32Array(n);
    ss = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const b = tb[i] ?? 0;
      const k = fill[b] ?? 0;
      fill[b] = k + 1;
      const a = ta[i] ?? 0;
      sr[k] = tr[i] ?? 0;
      sa[k] = a;
      sc[k] = Math.cos(a);
      ss[k] = Math.sin(a);
    }
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const resized = nw !== w || nh !== h;
    w = nw;
    h = nh;
    dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (resized || !dragging) {
      px.v = c.poleX * w;
      py.v = c.poleY * h;
      px.w = 0;
      py.w = 0;
      aimX = px.v;
      aimY = py.v;
    }
    buildStars();
    buildLayers();
    rand = lcg(c.seed * 7 + exposures * 13 + 1);
    const rr = lcg(c.seed * 19 + 2);
    radiant = { x: (rr() - 0.5) * w * 1.6, y: -h * (0.4 + rr() * 0.8) };
    if (!c.motionSafe) stillMeteor();
  };

  const spawnMeteor = (forced = false) => {
    if (!cfg || w < 1) return;
    if (meteorCount >= MAX_METEORS) {
      // Oldest out: the pool is a short memory, not a growing list.
      meteors.push(meteors.shift() as Meteor);
      meteorCount = MAX_METEORS - 1;
    }
    const m = meteors[meteorCount];
    if (!m) return;
    // Somewhere in the open sky, running away from a radiant off-frame.
    const sx = w * (0.08 + rand() * 0.84);
    const sy = h * (0.06 + rand() * 0.42);
    let dx = sx - (w / 2 + radiant.x);
    let dy = sy - radiant.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    m.x = sx - px.v;
    m.y = sy - py.v;
    m.dx = dx;
    m.dy = dy;
    m.len = (60 + rand() * 100) * Math.min(1.2, w / 520 + 0.4);
    m.born = forced ? clock - 1 : clock;
    m.dur = 0.28 + rand() * 0.18;
    m.bright = 0.55 + rand() * 0.45;
    meteorCount += 1;
  };

  /** Reduced motion: the still keeps one recorded meteor of its own. */
  const stillMeteor = () => {
    meteorCount = 0;
    rand = lcg((cfg?.seed ?? 7) * 7 + exposures * 13 + 1);
    if ((cfg?.meteors ?? 0) > 0) spawnMeteor(true);
  };

  const shownHours = () => {
    const c = cfg;
    if (!c) return 0;
    return c.motionSafe ? hours : clamp(c.maxHours, 1, 12) * 0.75;
  };

  const writeReadout = () => {
    if (!readout) return;
    const shown = shownHours();
    const minute = Math.floor(shown * 60 + 1e-6);
    if (minute === shownMinute) return;
    shownMinute = minute;
    readout.textContent =
      phase === "closing" || phase === "closed" ? "" : hoursText(shown);
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || w < 1) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = skyFill ?? sky;
    ctx.fillRect(0, 0, w, h);
    const shown = shownHours();
    const max = clamp(c.maxHours, 1, 12);
    // Light gathers: a long exposure is brighter along the horizon.
    ctx.globalAlpha = clamp(c.glow, 0, 1) * (0.5 + 0.5 * (shown / max));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(glowLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pX = px.v;
    const pY = py.v;
    const span = shown * RAD_PER_HOUR;
    const far = Math.max(
      Math.hypot(pX, pY),
      Math.hypot(w - pX, pY),
      Math.hypot(pX, h - pY),
      Math.hypot(w - pX, h - pY),
    );
    ctx.lineCap = "round";
    // The bright stars' soft underlay first, then every class's thin core,
    // each class one path so a rich sky is a dozen strokes, not thousands.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let b = 0; b < BUCKETS; b += 1) {
        const bi = Math.floor(b / 3);
        const ti = b % 3;
        const width = pass === 0 ? (HALO_WIDTH[bi] ?? 0) : (WIDTH[bi] ?? 1);
        const alpha = pass === 0 ? (HALO_ALPHA[bi] ?? 0) : (ALPHA[bi] ?? 1);
        if (width <= 0 || alpha <= 0) continue;
        const from = bucketStart[b] ?? 0;
        const to = bucketStart[b + 1] ?? from;
        if (to <= from) continue;
        ctx.strokeStyle = stars[ti] ?? "white";
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let k = from; k < to; k += 1) {
          const r = sr[k] ?? 0;
          if (r > far) continue;
          const cs = sc[k] ?? 1;
          const sn = ss[k] ?? 0;
          const a0 = sa[k] ?? 0;
          // A fresh exposure still draws a point: a sliver of arc with a
          // round cap.
          const sweep = Math.max(span, 0.45 / Math.max(1, r));
          ctx.moveTo(pX + r * cs, pY + r * sn);
          ctx.arc(pX, pY, r, a0, a0 - sweep, true);
        }
        ctx.stroke();
      }
    }

    // Meteors: a tapered streak recorded in the exposure, with a bright head
    // while it burns.
    ctx.lineCap = "butt";
    for (let i = 0; i < meteorCount; i += 1) {
      const m = meteors[i];
      if (!m) continue;
      const p = c.motionSafe ? clamp((clock - m.born) / m.dur, 0, 1) : 1;
      if (p <= 0) continue;
      const sx = pX + m.x;
      const sy = pY + m.y;
      const SEG = 7;
      ctx.strokeStyle = stars[1] ?? "white";
      for (let s = 0; s < SEG; s += 1) {
        const t0 = s / SEG;
        const t1 = (s + 1) / SEG;
        if (t0 > p) break;
        const tm = (t0 + t1) / 2;
        // Brightens, peaks two-thirds along, then burns out.
        const env = Math.sin(Math.PI * Math.pow(tm, 0.8));
        ctx.globalAlpha = 0.62 * m.bright * env;
        ctx.lineWidth = 0.5 + 1.1 * env * m.bright;
        ctx.beginPath();
        ctx.moveTo(sx + m.dx * m.len * t0, sy + m.dy * m.len * t0);
        const end = Math.min(t1, p);
        ctx.lineTo(sx + m.dx * m.len * end, sy + m.dy * m.len * end);
        ctx.stroke();
      }
      if (p < 1) {
        const hx = sx + m.dx * m.len * p;
        const hy = sy + m.dy * m.len * p;
        const size = 12 * (0.7 + m.bright * 0.5);
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sprite, hx - size / 2, hy - size / 2, size, size);
      }
    }

    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(groundLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The shutter curtain: a travelling sheet when motion is welcome, a
    // fade through dark when it is not.
    if (c.motionSafe) {
      const cover = clamp(curtain.v, 0, 1.06) * h;
      if (cover > 0.3) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = deep;
        ctx.fillRect(0, 0, w, cover);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = rim;
        ctx.fillRect(0, Math.min(h, cover) - 0.75, w, 0.75);
      }
    } else if (fade > 0.002) {
      ctx.globalAlpha = clamp(fade, 0, 1);
      ctx.fillStyle = deep;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
    writeReadout();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const clearExposure = () => {
    hours = 0;
    meteorCount = 0;
    exposures += 1;
    rand = lcg((cfg?.seed ?? 7) * 7 + exposures * 13 + 1);
    if (cfg && !cfg.motionSafe) stillMeteor();
  };

  const scheduleLoop = () => {
    const c = cfg;
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
    if (!c || !c.loop || !c.motionSafe || phase !== "complete") return;
    holdTimer = window.setTimeout(
      () => {
        holdTimer = 0;
        if (!visible.current || document.hidden) return;
        shutter(false);
      },
      clamp(c.hold, 0, 600000),
    );
  };

  const shutter = (visitor: boolean) => {
    const c = cfg;
    if (!c || phase === "closing" || phase === "closed") return;
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
    byVisitor = visitor;
    phase = "closing";
    shownMinute = -1;
    kick();
  };

  const integrate = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    // The shutter.
    if (phase === "closing") {
      if (c.motionSafe) {
        stepSpring(curtain, 1.04, springs.flick, dt);
        if (curtain.v >= 1) {
          curtain.v = 1;
          curtain.w = 0;
          phase = "closed";
        }
      } else {
        fade = Math.min(1, fade + dt / 0.12);
        if (fade >= 1) phase = "closed";
      }
      if (phase === "closed") {
        closedAt = clock;
        clearExposure();
        events.current.shutter(byVisitor);
      }
    } else if (phase === "closed") {
      if (clock - closedAt >= 0.12) {
        phase = "opening";
        shownMinute = -1;
      }
    } else if (phase === "opening") {
      if (c.motionSafe) {
        stepSpring(curtain, 0, springs.glide, dt);
        if (curtain.v < 0.002 && Math.abs(curtain.w) < 0.02) {
          curtain.v = 0;
          curtain.w = 0;
          phase = "exposing";
        }
      } else {
        fade = Math.max(0, fade - dt / 0.24);
        if (fade <= 0) phase = "exposing";
      }
    }
    // The exposure itself.
    if (
      c.motionSafe &&
      !c.paused &&
      (phase === "exposing" || phase === "opening")
    ) {
      const max = clamp(c.maxHours, 1, 12);
      hours += (dt * clamp(c.exposure, 1, 60)) / 60;
      const rate = clamp(c.meteors, 0, 60) / 60;
      if (rate > 0 && rand() < rate * dt) spawnMeteor();
      if (hours >= max) {
        hours = max;
        if (phase === "exposing") {
          phase = "complete";
          events.current.complete(max, byVisitor);
          scheduleLoop();
        }
      }
    }
    // The pole: 1:1 under the finger, otherwise a glide to where it aims.
    if (!dragging && gliding) {
      if (c.motionSafe) {
        stepSpring(px, aimX, springs.glide, dt);
        stepSpring(py, aimY, springs.glide, dt);
      }
      if (
        !c.motionSafe ||
        (Math.abs(px.v - aimX) < 0.05 &&
          Math.abs(py.v - aimY) < 0.05 &&
          Math.hypot(px.w, py.w) < 1)
      ) {
        px.v = aimX;
        py.v = aimY;
        px.w = 0;
        py.w = 0;
        gliding = false;
      }
    }
  };

  const burning = () => {
    for (let i = 0; i < meteorCount; i += 1) {
      const m = meteors[i];
      if (m && clock - m.born < m.dur) return true;
    }
    return false;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    integrate(dt);
    const growing =
      c.motionSafe &&
      !c.paused &&
      (phase === "exposing" || phase === "opening");
    const busy =
      dragging ||
      gliding ||
      phase === "closing" ||
      phase === "closed" ||
      phase === "opening" ||
      burning();
    // While only the arcs lengthen, 30 frames a second is plenty: they grow
    // a fraction of a pixel per frame.
    acc += dt;
    if (busy || acc >= 1 / 30) {
      acc = 0;
      draw();
    }
    if (busy || growing) frame = window.requestAnimationFrame(tick);
    else {
      draw();
      last = 0;
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || w < 1)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const aim = (x: number, y: number) => {
    aimX = x * w;
    aimY = y * h;
    gliding = true;
    kick();
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
        // The first exposure has already been open a while, so the frame
        // reads as circles from its first paint; a shutter starts from zero.
        hours = Math.min(2, clamp(next.maxHours, 1, 12) * 0.3);
        readColours();
        layout();
        draw();
        kick();
        return;
      }
      if (
        was.seed !== next.seed ||
        was.density !== next.density ||
        was.dpr !== next.dpr
      ) {
        layout();
      } else if (
        was.colorKey !== next.colorKey ||
        was.horizon !== next.horizon
      ) {
        readColours();
      }
      if (was.poleX !== next.poleX || was.poleY !== next.poleY) {
        if (!dragging) aim(next.poleX, next.poleY);
      }
      if (was.motionSafe !== next.motionSafe) {
        curtain.v = 0;
        curtain.w = 0;
        fade = 0;
        if (phase !== "complete") phase = "exposing";
        stillMeteor();
      }
      if (next.maxHours !== was.maxHours && hours >= next.maxHours) {
        hours = clamp(next.maxHours, 1, 12);
      }
      if (
        phase === "complete" &&
        (next.loop !== was.loop || next.hold !== was.hold)
      ) {
        scheduleLoop();
      }
      if (phase === "complete" && hours < clamp(next.maxHours, 1, 12)) {
        phase = "exposing";
      }
      shownMinute = -1;
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c) return;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        clamp(c.dpr, 0.5, 2),
      );
      if (w === root.clientWidth && h === root.clientHeight && dpr === ratio)
        return;
      layout();
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
      if (phase === "complete" && !holdTimer) scheduleLoop();
    },
    shutter,
    pole() {
      return [w > 0 ? px.v / w : 0.5, h > 0 ? py.v / h : 0.5];
    },
    grab() {
      dragging = true;
      gliding = false;
      px.w = 0;
      py.w = 0;
      kick();
    },
    dragTo(x, y) {
      px.v = x * w;
      py.v = y * h;
      kick();
    },
    release(x, y, vx, vy) {
      dragging = false;
      px.w = vx * w;
      py.w = vy * h;
      aim(x, y);
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (holdTimer) window.clearTimeout(holdTimer);
      holdTimer = 0;
    },
  };
}

/** The server's frame: concentric arcs round the pole above the ridge. */
function standIn(seed: number, pole: PoleTrailsPole, hours: number) {
  const rand = lcg(seed * 131 + 17);
  const cx = pole[0] * 760;
  const cy = pole[1] * 232;
  const arcs: { d: string; o: number; w: number }[] = [];
  for (let i = 0; i < 140; i += 1) {
    const r = 4 + Math.sqrt(rand()) * 470;
    const a0 = rand() * Math.PI * 2;
    const bright = Math.pow(rand(), 2.4);
    const a1 = a0 - hours * RAD_PER_HOUR;
    const x0 = r1(cx + r * Math.cos(a0));
    const y0 = r1(cy + r * Math.sin(a0));
    const x1 = r1(cx + r * Math.cos(a1));
    const y1 = r1(cy + r * Math.sin(a1));
    arcs.push({
      d: `M ${x0} ${y0} A ${r1(r)} ${r1(r)} 0 0 0 ${x1} ${y1}`,
      o: r3(0.22 + bright * 0.66),
      w: r1(0.5 + bright * 0.8),
    });
  }
  return arcs;
}

function ridgePath(horizon: PoleTrailsHorizon, seed: number) {
  const ys = profile(horizon, seed, 64);
  const n = ys.length - 1;
  let d = "M 0 1000";
  for (let i = 0; i <= n; i += 1) {
    d += ` L ${Math.round((i / n) * 1000)} ${Math.round((ys[i] ?? 0.8) * 1000)}`;
  }
  return `${d} L 1000 1000 Z`;
}

/**
 * A long exposure of the northern sky above a dark ridge. While the shutter is
 * open every star traces an arc round the celestial pole — 15° for every hour
 * of sky, gathered at `exposure` minutes a second — each tinted faintly by its
 * temperature, the bright ones with a soft underlay; skyglow gathers along the
 * horizon and a meteor now and then scores a straight streak that stays in the
 * picture. Arcs are drawn from the pole every frame, so they always stay
 * concentric on it.
 *
 * A click, a tap, Enter or Space closes the shutter: a curtain drops on
 * springs.flick, the exposure is cleared under it and it lifts away on
 * springs.glide over a fresh sky of points. Dragging moves the pole 1:1 and the
 * arcs re-centre live; a throw glides on with its own velocity. Arrow keys move
 * the pole, Home brings it back. Under reduced motion the frame is a still of a
 * finished exposure and the shutter fades through dark to a fresh still.
 */
export function PoleTrails({
  exposure = 10,
  density = 0.5,
  horizon = "ridge",
  maxHours = 6,
  loop = true,
  hold = 5000,
  meteors = 4,
  pole,
  defaultPole = DEFAULT_POLE,
  onPoleChange,
  skyColor = DEFAULT_SKY,
  groundColor = DEFAULT_GROUND,
  starColors = DEFAULT_STARS,
  glow = 0.5,
  interactive = true,
  paused = false,
  seed = 7,
  dpr = 2,
  onShutter,
  onComplete,
  label = "Night sky",
  disabled = false,
  className,
}: PoleTrailsProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [said, setSaid] = React.useState("");
  const [ownPole, setOwnPole] = React.useState<[number, number]>(() =>
    clampPole(defaultPole),
  );
  const shown = pole ? clampPole(pole) : ownPole;
  const poleX = shown[0];
  const poleY = shown[1];
  const controlled = pole !== undefined;

  const inks = React.useMemo(() => {
    const glowInk = `color-mix(in oklab, ${skyColor} 50%, oklch(from var(--warn) 0.52 0.075 h))`;
    return [
      skyColor,
      `color-mix(in oklab, ${skyColor} 62%, black)`,
      groundColor,
      glowInk,
      `color-mix(in oklab, ${glowInk} 55%, white)`,
      starColors[0],
      starColors[1],
      starColors[2],
    ];
  }, [skyColor, groundColor, starColors]);
  const colorKey = inks.join("|");
  // The server draws the same partly gathered first exposure the canvas
  // opens with.
  const firstHours = Math.min(2, clamp(maxHours, 1, 12) * 0.3);
  const arcs = React.useMemo(
    () => standIn(seed, [poleX, poleY], firstHours),
    [seed, poleX, poleY, firstHours],
  );
  const ridge = React.useMemo(() => ridgePath(horizon, seed), [horizon, seed]);

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const readoutRef = React.useRef<HTMLSpanElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callbacks = React.useRef({ onShutter, onComplete, onPoleChange });
  const events = React.useRef<Events>({
    shutter: (byVisitor) => {
      if (byVisitor) setSaid("New exposure");
      callbacks.current.onShutter?.();
    },
    complete: (hours, byVisitor) => {
      if (byVisitor)
        setSaid(
          `Exposure complete, ${hours} ${hours === 1 ? "hour" : "hours"}`,
        );
      callbacks.current.onComplete?.(hours);
    },
  });
  const dragStart = React.useRef<[number, number]>([0, 0]);

  const config: Config = {
    exposure,
    density,
    horizon,
    maxHours,
    loop,
    hold,
    meteors,
    glow,
    paused,
    seed,
    dpr,
    poleX,
    poleY,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callbacks.current = { onShutter, onComplete, onPoleChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 8) return;
    const e = createEngine(
      root,
      canvas,
      carriers,
      readoutRef.current,
      visible,
      events,
    );
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLButtonElement | null) => {
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

  const inert = disabled || !interactive;

  const commitPole = (next: [number, number]) => {
    const landed = clampPole(next);
    if (!controlled) setOwnPole(landed);
    onPoleChange?.(landed);
    return landed;
  };

  const drag = useDrag({
    threshold: 4,
    disabled: inert,
    onStart: () => {
      const e = engine.current;
      if (!e) return;
      dragStart.current = e.pole();
      e.grab();
    },
    onMove: ({ offset }) => {
      const root = rootRef.current;
      if (!root) return;
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      const x = rubberClamp(
        dragStart.current[0] + offset.x / w,
        POLE_X[0],
        POLE_X[1],
        0.3,
      );
      const y = rubberClamp(
        dragStart.current[1] + offset.y / h,
        POLE_Y[0],
        POLE_Y[1],
        0.3,
      );
      engine.current?.dragTo(x, y);
    },
    onEnd: ({ velocity }) => {
      const root = rootRef.current;
      const e = engine.current;
      if (!root || !e) return;
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      const [x, y] = e.pole();
      const vx = motionSafe ? velocity.x / w : 0;
      const vy = motionSafe ? velocity.y / h : 0;
      // A throw lands where a heavy mount would coast to.
      const landed = clampPole([
        motionSafe ? project(x, vx, 0.992) : x,
        motionSafe ? project(y, vy, 0.992) : y,
      ]);
      // Controlled: go back to where the host says the pole is; if the host
      // takes the change, the next render carries the pole to it before the
      // next frame.
      const target = controlled ? shown : landed;
      e.release(target[0], target[1], vx, vy);
      commitPole(landed);
    },
    onCancel: () => {
      const e = engine.current;
      if (!e) return;
      e.release(poleX, poleY, 0, 0);
    },
    onTap: () => engine.current?.shutter(true),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (inert) return;
    const root = rootRef.current;
    if (!root) return;
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    const stride = event.shiftKey ? 72 : 24;
    let next: [number, number] | null = null;
    let words = "";
    if (event.key === "ArrowLeft") {
      next = [poleX - stride / w, poleY];
      words = "left";
    } else if (event.key === "ArrowRight") {
      next = [poleX + stride / w, poleY];
      words = "right";
    } else if (event.key === "ArrowUp") {
      next = [poleX, poleY - stride / h];
      words = "up";
    } else if (event.key === "ArrowDown") {
      next = [poleX, poleY + stride / h];
      words = "down";
    } else if (event.key === "Home") {
      next = clampPole(defaultPole);
      words = "home";
    }
    if (!next) return;
    event.preventDefault();
    const landed = commitPole(next);
    const at = `${Math.round(landed[0] * 100)}% across, ${Math.round(landed[1] * 100)}% down`;
    setSaid(
      words === "home" ? `Pole back home, ${at}` : `Pole moved ${words}, ${at}`,
    );
  };

  return (
    <button
      ref={bindRoot}
      type="button"
      aria-label={`${label}: start a new exposure`}
      aria-describedby={hintId}
      aria-disabled={inert || undefined}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it is Space, Enter or assistive technology.
        if (event.detail === 0 && !inert) engine.current?.shutter(true);
      }}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/pole-trails relative isolate block h-56 w-full touch-none overflow-clip rounded-3 text-left [contain:paint] outline-none select-none",
        inert ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ backgroundColor: inks[0] }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 block group-data-live/pole-trails:hidden"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${inks[1]}, ${inks[0]} 55%, ${inks[3]})`,
        }}
      >
        <svg
          viewBox="0 0 760 232"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 size-full"
        >
          {arcs.map((arc, i) => (
            <path
              key={i}
              d={arc.d}
              fill="none"
              stroke={inks[6]}
              strokeOpacity={arc.o}
              strokeWidth={arc.w}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path d={ridge} fill={inks[2]} />
        </svg>
      </span>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={readoutRef}
        aria-hidden
        className="pointer-events-none absolute right-3 bottom-2 font-mono text-[9px] tracking-[0.08em] tabular-nums"
        style={{ color: READOUT }}
      />
      {inks.map((ink, i) => (
        <span
          key={i}
          ref={(node) => {
            carrierRefs.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color: ink }}
        />
      ))}
      <span id={hintId} className="sr-only">
        Drag or use the arrow keys to move the pole. Home brings it back.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </button>
  );
}
