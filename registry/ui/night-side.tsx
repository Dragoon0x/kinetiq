"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type NightSidePoint = {
  /** Stable id, used by routes and by `value`. */
  id: string;
  /** Shown on the label chip and spoken. */
  name: string;
  /** Degrees north (negative south), −90 to 90. */
  lat: number;
  /** Degrees east of the prime meridian (negative west), −180 to 180. */
  lon: number;
};

export type NightSideRoute = {
  /** The office the route leaves from. */
  from: string;
  /** The office it arrives at. */
  to: string;
};

export type NightSideColors = {
  /** The body on the sunlit half. */
  day?: string;
  /** The body on the dark half. A pigment: it stays dark in both themes. */
  night?: string;
  /** Land dots in daylight. */
  land?: string;
  /** City lights. */
  lights?: string;
  /** Route arcs and their pulses. */
  routes?: string;
  /** Office markers. */
  points?: string;
};

export type NightSideProps = {
  /** The offices. @default defaultNightSidePoints */
  points?: NightSidePoint[];
  /** Routes between offices, by id. @default defaultNightSideRoutes */
  routes?: NightSideRoute[];
  /** The hour at the prime meridian, 0 to 24. Changing it sweeps the day across the globe. @default 18 */
  timeOfDay?: number;
  /** How high the route arcs rise, 0 (hugging the ground) to 1. @default 0.45 */
  arcHeight?: number;
  /** Rows of dots from pole to pole, 36 to 120. @default 66 */
  dotDensity?: number;
  /** The sun's declination in degrees, −23.4 (southern summer) to 23.4. @default 14 */
  season?: number;
  /** How far the view looks down on the north, −30 to 30 degrees. @default 16 */
  tilt?: number;
  /** Degrees per second of the slow turn; 0 holds it still. @default 5 */
  spin?: number;
  /** How long a throw coasts, 0 (stops at once) to 1. @default 0.6 */
  momentum?: number;
  /** Pace of the light along the routes, 0 (held, lit) to 3. @default 1 */
  pulseSpeed?: number;
  /** How many cities glow and how brightly, 0 to 1. @default 0.8 */
  lights?: number;
  /** The globe's inks. Tokens and fixed pigments by default, so both themes read. */
  colors?: NightSideColors;
  /** Controlled: the selected office's id, brought round to face you. */
  value?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that selected an office or cleared it. */
  onValueChange?: (id: string | null) => void;
  /** Drag, click and the keys turn the globe. @default true */
  interactive?: boolean;
  /** Hold the turn, the pulses and the day's sweep. @default false */
  paused?: boolean;
  /** Seeds the continents and the cities. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The globe's accessible name; the hour and the dark offices are added. @default "Offices around the world" */
  label?: string;
  /** Sizes the box. @default "h-60 w-full" */
  className?: string;
};

export const defaultNightSidePoints: NightSidePoint[] = [
  { id: "coldbrook", name: "Coldbrook", lat: 47, lon: -16 },
  { id: "basinworks", name: "Basinworks", lat: 21, lon: 36 },
  { id: "fieldline", name: "Fieldline", lat: 55, lon: 64 },
  { id: "waylight", name: "Waylight", lat: -19, lon: 10 },
  { id: "fernworks", name: "Fernworks", lat: 6, lon: -50 },
  { id: "gaugeworks", name: "Gaugeworks", lat: 32, lon: 98 },
];

export const defaultNightSideRoutes: NightSideRoute[] = [
  { from: "coldbrook", to: "basinworks" },
  { from: "basinworks", to: "gaugeworks" },
  { from: "fernworks", to: "coldbrook" },
  { from: "basinworks", to: "waylight" },
  { from: "coldbrook", to: "fieldline" },
];

const DEFAULT_COLORS: Required<NightSideColors> = {
  day: "color-mix(in oklab, var(--card) 74%, var(--ink-3))",
  night: "oklch(from var(--accent) 0.21 0.045 h)",
  land: "var(--ink-2)",
  lights: "oklch(from var(--warn) 0.86 0.13 h)",
  routes: "oklch(from var(--accent-bright) 0.74 0.14 h)",
  points: "var(--foreground)",
};

/* --------------------------------- maths --------------------------------- */

const DEG = Math.PI / 180;
/** Furthest the visitor can tip the globe, radians. */
const TIP = 32 * DEG;
/** Integration step for every spring, seconds. */
const STEP = 1 / 240;
/** Arc samples per route. */
const ARC = 44;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mod = (a: number, n: number) => ((a % n) + n) % n;
const wrapPi = (a: number) => mod(a + Math.PI, Math.PI * 2) - Math.PI;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

type SpringDef = { stiffness: number; damping: number; mass: number };
type Body = { x: number; v: number };

/** Advances one spring toward a target in fixed steps; returns true once at rest. */
function springTo(s: Body, target: number, sp: SpringDef, dt: number) {
  let left = dt;
  while (left > 1e-7) {
    const h = Math.min(STEP, left);
    left -= h;
    const a = (-sp.stiffness * (s.x - target) - sp.damping * s.v) / sp.mass;
    s.v += a * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x - target) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = target;
    s.v = 0;
    return true;
  }
  return false;
}

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 1597334677) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Seeded value noise on a 3D lattice, smooth between points. */
function noise3(seed: number) {
  const hash = (x: number, y: number, z: number) => {
    let h =
      Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 1440662683) ^
      seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, z: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const u = fade(x - ix);
    const v = fade(y - iy);
    const w = fade(z - iz);
    const a = lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), u);
    const b = lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u);
    const c = lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u);
    const d = lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u);
    return lerp(lerp(a, b, v), lerp(c, d, v), w);
  };
}

/** A unit vector on the globe: x east at lon 90, y north, z out of lon 0. */
const unit = (lat: number, lon: number): [number, number, number] => {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [
    Math.cos(la) * Math.sin(lo),
    Math.sin(la),
    Math.cos(la) * Math.cos(lo),
  ];
};

/** The sun's direction for an hour at the prime meridian and a declination. */
const sunAt = (hours: number, season: number): [number, number, number] =>
  unit(clamp(season, -23.4, 23.4), (12 - hours) * 15);

export type NightSideReading = {
  /** Local solar time, "HH:MM". */
  time: string;
  /** Whether the sun is up there. */
  phase: "day" | "dusk" | "night" | "dawn";
};

/**
 * Local solar time and daylight at an office for an hour at the prime
 * meridian: what the globe shows, in words. Rounded before it is compared, so
 * the server and the browser agree.
 */
export function nightSideReading(
  point: Pick<NightSidePoint, "lat" | "lon">,
  timeOfDay: number,
  season = 14,
): NightSideReading {
  const local = mod(timeOfDay + point.lon / 15, 24);
  const minutes = mod(Math.round(local * 60), 1440);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const p = unit(point.lat, point.lon);
  const s = sunAt(timeOfDay, season);
  const e = r4(p[0] * s[0] + p[1] * s[1] + p[2] * s[2]);
  const phase =
    e > 0.08 ? "day" : e < -0.1 ? "night" : local < 12 ? "dawn" : "dusk";
  return { time: `${hh}:${mm}`, phase };
}

/* --------------------------------- world --------------------------------- */

type World = {
  /** Dot unit vectors, xyz interleaved. */
  dots: Float32Array;
  /** 1 for land, 0 for the sparse ocean screen. */
  land: Uint8Array;
  count: number;
  /** City unit vectors, xyz interleaved. */
  cities: Float32Array;
  /** Per city: how dark it must be before it lights (sun elevation). */
  dusk: Float32Array;
  /** Per city: brightness and rank (a lower rank shows at a lower `lights`). */
  glow: Float32Array;
  rank: Float32Array;
  cityCount: number;
};

/**
 * Lays the dots on equal-area latitude rows, finds land in seeded fbm on the
 * sphere (with a bump under every office, so each one stands on land and
 * continents grow round them), keeps the wettest 62% as ocean, and scatters
 * cities over the land, three times as dense along the coasts and round the
 * offices.
 */
function buildWorld(
  seed: number,
  rows: number,
  offices: [number, number, number][],
): World {
  const noise = noise3(Math.imul(Math.round(seed) | 0, 2246822519) | 0);
  const fbm = (x: number, y: number, z: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1.7;
    for (let o = 0; o < 4; o += 1) {
      sum += amp * noise(x * f + o * 17.3, y * f - o * 9.1, z * f + o * 4.7);
      f *= 2.03;
      amp *= 0.5;
    }
    return sum;
  };
  const height = (x: number, y: number, z: number) => {
    let v = fbm(x, y, z);
    for (const o of offices) {
      const d = Math.acos(clamp(x * o[0] + y * o[1] + z * o[2], -1, 1));
      v += 0.28 * Math.exp(-((d / 0.3) ** 2));
    }
    return v;
  };

  const n = clamp(Math.round(rows), 36, 120);
  const xs: number[] = [];
  const heights: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const lat = -90 + ((i + 0.5) * 180) / n;
    const cols = Math.max(1, Math.round(2 * n * Math.cos(lat * DEG)));
    for (let j = 0; j < cols; j += 1) {
      const lon = ((j + 0.5 * (i % 2)) * 360) / cols - 180;
      const [x, y, z] = unit(lat, lon);
      xs.push(x, y, z, i, j);
      heights.push(height(x, y, z));
    }
  }
  const sorted = [...heights].sort((a, b) => a - b);
  const sea = sorted[Math.floor(sorted.length * 0.62)] ?? 0.5;

  const dots: number[] = [];
  const land: number[] = [];
  const landIdx: number[] = [];
  heights.forEach((h, k) => {
    const base = k * 5;
    const i = xs[base + 3] ?? 0;
    const j = xs[base + 4] ?? 0;
    const isLand = h > sea;
    // The ocean keeps one dot in four: enough to read the ball, not the sea.
    if (!isLand && (i % 2 !== 0 || j % 2 !== 0)) return;
    dots.push(xs[base] ?? 0, xs[base + 1] ?? 0, xs[base + 2] ?? 0);
    land.push(isLand ? 1 : 0);
    if (isLand) landIdx.push(k);
  });

  const rand = lcg(seed * 977 + 31);
  const want = 150;
  const spacing = Math.PI / n;
  const cities: number[] = [];
  const dusk: number[] = [];
  const glow: number[] = [];
  for (const k of landIdx) {
    const h = heights[k] ?? 0;
    const base = k * 5;
    const x = xs[base] ?? 0;
    const y = xs[base + 1] ?? 0;
    const z = xs[base + 2] ?? 0;
    let weight = h - sea < 0.03 ? 3 : 1;
    for (const o of offices) {
      if (x * o[0] + y * o[1] + z * o[2] > Math.cos(0.22)) weight += 3;
    }
    if (rand() > (want * weight) / Math.max(1, landIdx.length * 1.6)) continue;
    // Off the dot grid, so the lights never line up with the dots.
    const jx = x + (rand() - 0.5) * spacing;
    const jy = y + (rand() - 0.5) * spacing;
    const jz = z + (rand() - 0.5) * spacing;
    const len = Math.hypot(jx, jy, jz) || 1;
    cities.push(jx / len, jy / len, jz / len);
    dusk.push(-0.025 - rand() * 0.1);
    glow.push(0.45 + rand() * 0.55);
  }
  const cityCount = dusk.length;
  const rank = new Float32Array(cityCount);
  for (let c = 0; c < cityCount; c += 1) rank[c] = rand();
  return {
    dots: Float32Array.from(dots),
    land: Uint8Array.from(land),
    count: land.length,
    cities: Float32Array.from(cities),
    dusk: Float32Array.from(dusk),
    glow: Float32Array.from(glow),
    rank,
    cityCount,
  };
}

/* --------------------------------- engine -------------------------------- */

type Config = {
  points: NightSidePoint[];
  routes: NightSideRoute[];
  timeOfDay: number;
  arcHeight: number;
  dotDensity: number;
  season: number;
  tilt: number;
  spin: number;
  momentum: number;
  pulseSpeed: number;
  lights: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  selected: string | null;
  motionSafe: boolean;
};

type Rgb = [number, number, number];

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  grab: () => void;
  drag: (dx: number, dy: number) => void;
  drop: (vx: number, vy: number) => void;
  hit: (x: number, y: number) => string | null;
  turn: (dyaw: number, dtilt: number) => void;
  face: () => void;
  dispose: () => void;
};

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];
const css = (c: Rgb, alpha = 1) =>
  `rgb(${c[0]} ${c[1]} ${c[2]} / ${r2(alpha)})`;
/** One ink at 21 alphas, built when the inks are read, so a frame builds no strings. */
const rampOf = (c: Rgb) => Array.from({ length: 21 }, (_, i) => css(c, i / 20));
const at = (ramp: string[], alpha: number) =>
  ramp[Math.round(clamp01(alpha) * 20)] ?? "transparent";

/** Light switching on: half bright, a dip, then up to full, in ms. */
const flickerOn = (t: number) => {
  if (t <= 0) return 0;
  if (t < 60) return (t / 60) * 0.55;
  if (t < 110) return lerp(0.55, 0.2, (t - 60) / 50);
  if (t < 330) {
    const k = (t - 110) / 220;
    return lerp(0.2, 1, 1 - (1 - k) ** 3);
  }
  return 1;
};
const fadeOff = (t: number) => (t >= 600 ? 0 : 1 - smooth(0, 600, t));

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let world: World | null = null;
  let worldKey = "";
  let frame = 0;
  let last = 0;
  let disposed = false;
  let family = "ui-monospace, monospace";

  // Layout.
  let w = 0;
  let h = 0;
  let dpr = 1;
  let R = 1;
  let cx = 0;
  let cy = 0;

  // Inks.
  let cDay: Rgb = [220, 222, 228];
  let cNight: Rgb = [20, 26, 48];
  let cLand: Rgb = [100, 106, 120];
  let cLights: Rgb = [250, 210, 140];
  let cRoutes: Rgb = [90, 130, 240];
  let cPoints: Rgb = [30, 34, 44];
  let cCard: Rgb = [255, 255, 255];
  let cText: Rgb = [30, 34, 44];
  let cAtmos: Rgb = [90, 130, 240];
  let landInk: string[] = [];
  let oceanInk: string[] = [];
  let atmosRamp: string[] = [];
  let routeRamp: string[] = [];
  let brightRamp: string[] = [];
  let tipRamp: string[] = [];
  let pingRamp: string[] = [];
  let pointRamp: string[] = [];
  let chipFill = "transparent";
  let chipText = "transparent";
  let halo: CanvasGradient | null = null;
  let twilight: Rgb = [120, 100, 90];
  let glowSprite: HTMLCanvasElement | null = null;

  // The shaded body, painted small and scaled into the disc.
  let shade: HTMLCanvasElement | null = null;
  let shadeCtx: CanvasRenderingContext2D | null = null;
  let shadeData: ImageData | null = null;
  let shadeN = 0;

  // Per-frame scratch, sized with the world.
  let sx = new Float32Array(0);
  let sy = new Float32Array(0);
  let sr = new Float32Array(0);
  let sb = new Int8Array(0);
  let lit = new Uint8Array(0);
  let since = new Float64Array(0);
  let flickerUntil = 0;

  // Routes, in world space.
  type Route = {
    pts: Float32Array;
    span: number;
    rise: Body;
    delay: number;
    offset: number;
    head: number;
    to: [number, number, number];
  };
  let routes: Route[] = [];
  let routesKey = "";
  const pings: { x: number; y: number; z: number; t: number }[] = [];
  const scratchA = new Float32Array(3);
  const scratchB = new Float32Array(3);

  // Offices on screen, for hit testing, and the order chips are placed in.
  let officeV = new Float32Array(0);
  let officeX = new Float32Array(0);
  let officeY = new Float32Array(0);
  let officeZ = new Float32Array(0);
  let placed = new Float32Array(0);
  let order: number[] = [];
  let labelW = new Map<string, number>();

  // View state.
  const yaw: Body = { x: 0, v: 0 };
  const tip: Body = { x: 0, v: 0 };
  const time: Body = { x: 18, v: 0 };
  const ring: Body = { x: 0, v: 0 };
  let yawTarget = 0;
  let yawMode: "free" | "spring" = "free";
  let tipTarget = 0;
  let timeTarget = 18;
  let dragging = false;
  let grabYaw = 0;
  let grabTip = 0;
  let clock = 0;
  let riseClock = 0;
  let rising = false;
  let selected: string | null = null;
  let introduced = false;

  const readColours = () => {
    const ink = carriers.map((el) => read(getComputedStyle(el).color));
    cDay = ink[0] ?? cDay;
    cNight = ink[1] ?? cNight;
    cLand = ink[2] ?? cLand;
    cLights = ink[3] ?? cLights;
    cRoutes = ink[4] ?? cRoutes;
    cPoints = ink[5] ?? cPoints;
    cCard = ink[6] ?? cCard;
    cText = ink[7] ?? cText;
    cAtmos = ink[8] ?? cAtmos;
    family = getComputedStyle(canvas).fontFamily || family;
    labelW = new Map();
    // Dots by daylight (four steps) and by how square-on they are (three).
    const nightDot = mix(cNight, [255, 255, 255], 0.2);
    landInk = [];
    for (let d = 0; d < 4; d += 1) {
      for (let l = 0; l < 3; l += 1) {
        landInk.push(css(mix(nightDot, cLand, d / 3), [0.42, 0.72, 1][l] ?? 1));
      }
    }
    oceanInk = [
      css(mix(cNight, [255, 255, 255], 0.1), 0.5),
      css(mix(cDay, cLand, 0.32), 0.55),
    ];
    atmosRamp = rampOf(cAtmos);
    routeRamp = rampOf(cRoutes);
    brightRamp = rampOf(mix(cRoutes, [255, 255, 255], 0.6));
    tipRamp = rampOf(mix(cRoutes, [255, 255, 255], 0.55));
    pingRamp = rampOf(mix(cRoutes, [255, 255, 255], 0.4));
    pointRamp = rampOf(cPoints);
    twilight = mix(cLights, cNight, 0.45);
    chipFill = css(cCard, 0.9);
    chipText = css(cText, 1);
    halo = null;
    const g = glowSprite ?? document.createElement("canvas");
    g.width = 32;
    g.height = 32;
    const gx = g.getContext("2d");
    if (gx) {
      gx.clearRect(0, 0, 32, 32);
      const grad = gx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, css(mix(cLights, [255, 255, 255], 0.5), 1));
      grad.addColorStop(0.18, css(cLights, 0.85));
      grad.addColorStop(0.45, css(cLights, 0.22));
      grad.addColorStop(1, css(cLights, 0));
      gx.fillStyle = grad;
      gx.fillRect(0, 0, 32, 32);
    }
    glowSprite = g;
  };

  const officeVectors = (c: Config) =>
    c.points.map((p) => unit(clamp(p.lat, -90, 90), p.lon));

  const rebuildWorld = (c: Config) => {
    const key = `${c.seed}|${Math.round(c.dotDensity)}|${c.points
      .map((p) => `${p.lat},${p.lon}`)
      .join(";")}`;
    if (key === worldKey && world) return;
    worldKey = key;
    world = buildWorld(c.seed, c.dotDensity, officeVectors(c));
    sx = new Float32Array(world.count);
    sy = new Float32Array(world.count);
    sr = new Float32Array(world.count);
    sb = new Int8Array(world.count);
    lit = new Uint8Array(world.cityCount);
    since = new Float64Array(world.cityCount).fill(-1e9);
    // The lights start as the hour says, with no flicker.
    const s = sunAt(time.x, c.season);
    for (let k = 0; k < world.cityCount; k += 1) {
      const e =
        (world.cities[k * 3] ?? 0) * s[0] +
        (world.cities[k * 3 + 1] ?? 0) * s[1] +
        (world.cities[k * 3 + 2] ?? 0) * s[2];
      lit[k] = e < (world.dusk[k] ?? 0) ? 1 : 0;
    }
  };

  const rebuildRoutes = (c: Config) => {
    const key = `${c.arcHeight}|${c.routes
      .map((r) => `${r.from}>${r.to}`)
      .join(
        ";",
      )}|${c.points.map((p) => `${p.id}:${p.lat},${p.lon}`).join(";")}`;
    if (key === routesKey) return;
    const fresh = routesKey === "";
    routesKey = key;
    const byId = new Map(c.points.map((p) => [p.id, p]));
    const lift = clamp01(c.arcHeight);
    const next: Route[] = [];
    c.routes.forEach((r, i) => {
      const a = byId.get(r.from);
      const b = byId.get(r.to);
      if (!a || !b || a === b) return;
      const A = unit(a.lat, a.lon);
      const B = unit(b.lat, b.lon);
      const dot = clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1);
      const omega = Math.acos(dot);
      if (omega < 1e-4) return;
      const so = Math.sin(omega);
      const peak = lift * (0.1 + 0.8 * (omega / Math.PI));
      const pts = new Float32Array((ARC + 1) * 3);
      for (let k = 0; k <= ARC; k += 1) {
        const t = k / ARC;
        const fa = Math.sin((1 - t) * omega) / so;
        const fb = Math.sin(t * omega) / so;
        const up = 1 + peak * Math.sin(Math.PI * t);
        pts[k * 3] = (A[0] * fa + B[0] * fb) * up;
        pts[k * 3 + 1] = (A[1] * fa + B[1] * fb) * up;
        pts[k * 3 + 2] = (A[2] * fa + B[2] * fb) * up;
      }
      const old = routes[i];
      next.push({
        pts,
        span: omega,
        rise: fresh || !old ? { x: 0, v: 0 } : old.rise,
        delay: i * cascade(c.routes.length),
        offset: (i * 0.37) % 1,
        head: -1,
        to: B,
      });
    });
    routes = next;
  };

  const placeOffices = (c: Config) => {
    const n = c.points.length;
    officeV = new Float32Array(n * 3);
    c.points.forEach((p, i) =>
      officeV.set(unit(clamp(p.lat, -90, 90), p.lon), i * 3),
    );
    officeX = new Float32Array(n);
    officeY = new Float32Array(n);
    officeZ = new Float32Array(n);
    placed = new Float32Array(n * 4);
    // The selected office's chip is placed first, so it is never the one hidden.
    order = c.points.map((_, i) => i);
    const sel = c.points.findIndex((p) => p.id === c.selected);
    if (sel > 0) order = [sel, ...order.filter((i) => i !== sel)];
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    w = root.clientWidth;
    h = root.clientHeight;
    if (w < 1 || h < 1) return;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Room for the tallest arc near the limb, and a hair for the halo.
    const lift = clamp01(c.arcHeight) * 0.9;
    R = Math.max(20, (Math.min(w, h) / 2 / (1 + lift * 0.4)) * 0.95);
    cx = w / 2;
    cy = h / 2;
    halo = null;
    const n = clamp(Math.round(R * 2 * dpr * 0.42), 64, 150);
    if (n !== shadeN || !shade) {
      shadeN = n;
      shade = shade ?? document.createElement("canvas");
      shade.width = n;
      shade.height = n;
      shadeCtx = shade.getContext("2d");
      shadeData = shadeCtx ? shadeCtx.createImageData(n, n) : null;
    }
  };

  const spinRate = () => {
    const c = cfg;
    if (!c || !c.motionSafe || c.paused || selected !== null || dragging)
      return 0;
    return clamp(c.spin, -60, 60) * DEG;
  };

  const draw = (now: number) => {
    const c = cfg;
    const wd = world;
    if (!c || !ctx || !wd || w < 1) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    const cyw = Math.cos(yaw.x);
    const syw = Math.sin(yaw.x);
    const cb = Math.cos(tip.x);
    const sbt = Math.sin(tip.x);
    // World → view: turn about the axis, then tip toward the eye.
    const vx = (x: number, z: number) => x * cyw + z * syw;
    const vz1 = (x: number, z: number) => -x * syw + z * cyw;
    const sun = sunAt(time.x, c.season);
    const s1z = vz1(sun[0], sun[2]);
    const Sx = vx(sun[0], sun[2]);
    const Sy = sun[1] * cb - s1z * sbt;
    const Sz = sun[1] * sbt + s1z * cb;

    // Halo: a faint ring of air, brighter on the sunlit limb.
    if (!halo) {
      halo = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.09);
      halo.addColorStop(0, css(cAtmos, 0.16));
      halo.addColorStop(1, css(cAtmos, 0));
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.09, 0, Math.PI * 2);
    ctx.fill();

    // The body: day, a warm twilight band, night, and a darker limb.
    if (shade && shadeCtx && shadeData) {
      const n = shadeN;
      const data = shadeData.data;
      for (let j = 0; j < n; j += 1) {
        const v = 1 - ((j + 0.5) / n) * 2;
        for (let i = 0; i < n; i += 1) {
          const u = ((i + 0.5) / n) * 2 - 1;
          const d2 = u * u + v * v;
          const o = (j * n + i) * 4;
          if (d2 > 1.02) {
            data[o + 3] = 0;
            continue;
          }
          const z = Math.sqrt(Math.max(0, 1 - d2));
          const e = u * Sx + v * Sy + z * Sz;
          const day = smooth(-0.07, 0.12, e);
          const tw = Math.exp(-((e / 0.07) ** 2)) * 0.32;
          const limb = 0.8 + 0.2 * z;
          for (let k = 0; k < 3; k += 1) {
            const base = lerp(cNight[k] ?? 0, cDay[k] ?? 0, day);
            data[o + k] = lerp(base, twilight[k] ?? 0, tw) * limb;
          }
          data[o + 3] = Math.round(255 * clamp01((1.02 - d2) * 40));
        }
      }
      shadeCtx.putImageData(shadeData, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shade, cx - R, cy - R, R * 2, R * 2);
      ctx.restore();
    }

    // The sunlit rim.
    ctx.lineWidth = 1;
    for (let k = 0; k < 48; k += 1) {
      const a0 = (k / 48) * Math.PI * 2;
      const a1 = ((k + 1) / 48) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const lit2 = smooth(-0.15, 0.4, Math.cos(am) * Sx - Math.sin(am) * Sy);
      ctx.strokeStyle = at(atmosRamp, 0.1 + 0.35 * lit2);
      ctx.beginPath();
      ctx.arc(cx, cy, R + 0.5, a0, a1 + 0.01);
      ctx.stroke();
    }

    // Dots.
    const spacing = (Math.PI * R) / clamp(Math.round(c.dotDensity), 36, 120);
    const baseR = spacing * 0.34;
    const dots = wd.dots;
    for (let k = 0; k < wd.count; k += 1) {
      const x = dots[k * 3] ?? 0;
      const y = dots[k * 3 + 1] ?? 0;
      const z = dots[k * 3 + 2] ?? 0;
      const X = vx(x, z);
      const z1 = vz1(x, z);
      const Y = y * cb - z1 * sbt;
      const Z = y * sbt + z1 * cb;
      if (Z < 0.03) {
        sb[k] = -1;
        continue;
      }
      sx[k] = cx + X * R;
      sy[k] = cy - Y * R;
      sr[k] = baseR * (0.5 + 0.5 * Z);
      const e = x * sun[0] + y * sun[1] + z * sun[2];
      const day = smooth(-0.08, 0.12, e);
      if (wd.land[k]) {
        const dl = Math.round(day * 3);
        const ll = Z < 0.3 ? 0 : Z < 0.6 ? 1 : 2;
        sb[k] = dl * 3 + ll;
      } else {
        sb[k] = day > 0.5 ? 13 : 12;
      }
    }
    for (let b = 0; b < 14; b += 1) {
      const ink = b < 12 ? landInk[b] : oceanInk[b - 12];
      if (!ink) continue;
      ctx.fillStyle = ink;
      ctx.beginPath();
      const ocean = b >= 12;
      for (let k = 0; k < wd.count; k += 1) {
        if (sb[k] !== b) continue;
        const rr = (sr[k] ?? 1) * (ocean ? 0.62 : 1);
        const px = sx[k] ?? 0;
        const py = sy[k] ?? 0;
        if (rr < 0.9) {
          ctx.rect(px - rr, py - rr, rr * 2, rr * 2);
        } else {
          ctx.moveTo(px + rr, py);
          ctx.arc(px, py, rr, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    // City lights, added onto the dark half.
    if (glowSprite && c.lights > 0) {
      ctx.globalCompositeOperation = "lighter";
      const amount = clamp01(c.lights);
      const cities = wd.cities;
      const size = Math.max(5, spacing * 2.6);
      for (let k = 0; k < wd.cityCount; k += 1) {
        if ((wd.rank[k] ?? 1) > amount) continue;
        const x = cities[k * 3] ?? 0;
        const y = cities[k * 3 + 1] ?? 0;
        const z = cities[k * 3 + 2] ?? 0;
        const e = x * sun[0] + y * sun[1] + z * sun[2];
        const want = e < (wd.dusk[k] ?? 0) ? 1 : 0;
        if (want !== lit[k]) {
          lit[k] = want;
          since[k] = c.motionSafe && introduced ? now : -1e9;
          flickerUntil = Math.max(flickerUntil, (since[k] ?? 0) + 620);
        }
        const t = now - (since[k] ?? -1e9);
        const v = lit[k]
          ? c.motionSafe
            ? flickerOn(t)
            : 1
          : c.motionSafe
            ? fadeOff(t)
            : 0;
        if (v < 0.02) continue;
        const X = vx(x, z);
        const z1 = vz1(x, z);
        const Y = y * cb - z1 * sbt;
        const Z = y * sbt + z1 * cb;
        if (Z < 0.04) continue;
        const g =
          (wd.glow[k] ?? 1) * v * (0.4 + 0.6 * Z) * (0.5 + 0.5 * amount);
        const s = size * (0.7 + 0.5 * (wd.glow[k] ?? 1)) * (0.6 + 0.4 * Z);
        ctx.globalAlpha = clamp01(g);
        ctx.drawImage(glowSprite, cx + X * R - s / 2, cy - Y * R - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }

    // Routes: rise, then pulses ride them.
    const project = (pts: Float32Array, k: number, out: Float32Array) => {
      const x = pts[k * 3] ?? 0;
      const y = pts[k * 3 + 1] ?? 0;
      const z = pts[k * 3 + 2] ?? 0;
      const X = vx(x, z);
      const z1 = vz1(x, z);
      const Y = y * cb - z1 * sbt;
      const Z = y * sbt + z1 * cb;
      out[0] = cx + X * R;
      out[1] = cy - Y * R;
      // Seen when in front, or clear of the disc's silhouette.
      out[2] = Z >= 0 ? 1 : smooth(1, 1.05, Math.hypot(X, Y));
    };
    const a = scratchA;
    const b = scratchB;
    const pace = clamp(c.pulseSpeed, 0, 3);
    ctx.lineCap = "round";
    for (const route of routes) {
      const p = c.motionSafe ? clamp01(route.rise.x) : 1;
      if (p <= 0.001) continue;
      const end = p * ARC;
      for (let k = 0; k < ARC; k += 1) {
        if (k >= end) break;
        project(route.pts, k, a);
        project(route.pts, k + 1, b);
        const vis = Math.min(a[2] ?? 0, b[2] ?? 0);
        if (vis < 0.02) continue;
        const frac = Math.min(1, end - k);
        ctx.beginPath();
        ctx.moveTo(a[0] ?? 0, a[1] ?? 0);
        ctx.lineTo(
          lerp(a[0] ?? 0, b[0] ?? 0, frac),
          lerp(a[1] ?? 0, b[1] ?? 0, frac),
        );
        ctx.strokeStyle = at(routeRamp, 0.14 * vis);
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.strokeStyle = at(routeRamp, 0.7 * vis);
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      // While rising, a bright tip leads the line.
      if (p < 0.995) {
        const k = Math.min(ARC - 1, Math.floor(end));
        project(route.pts, k, a);
        project(route.pts, k + 1, b);
        const f = end - k;
        ctx.fillStyle = at(tipRamp, a[2] ?? 0);
        ctx.beginPath();
        ctx.arc(
          lerp(a[0] ?? 0, b[0] ?? 0, f),
          lerp(a[1] ?? 0, b[1] ?? 0, f),
          2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        continue;
      }
      // The pulse: a head with a fading tail; still and lit under reduced motion.
      const travel =
        (1.4 + 1.8 * (route.span / Math.PI)) / Math.max(0.05, pace);
      const head =
        c.motionSafe && pace > 0
          ? mod(clock / travel + route.offset, 1) * 1.3 - 0.15
          : 0.62;
      if (c.motionSafe && pace > 0) {
        if (route.head >= 0 && route.head < 1 && head >= 1) {
          pings.push({
            x: route.to[0],
            y: route.to[1],
            z: route.to[2],
            t: now,
          });
        }
        route.head = head;
      }
      const tail = 0.2;
      for (let k = 0; k < ARC; k += 1) {
        const t0 = k / ARC;
        const t1 = (k + 1) / ARC;
        if (t1 < head - tail || t0 > head) continue;
        project(route.pts, k, a);
        project(route.pts, k + 1, b);
        const vis = Math.min(a[2] ?? 0, b[2] ?? 0);
        if (vis < 0.02) continue;
        const along = clamp01(1 - (head - t1) / tail);
        ctx.strokeStyle = at(routeRamp, 0.35 * along * vis);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(a[0] ?? 0, a[1] ?? 0);
        ctx.lineTo(b[0] ?? 0, b[1] ?? 0);
        ctx.stroke();
        ctx.strokeStyle = at(brightRamp, along * vis);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // The head itself, a small bright bead.
      if (head > 0 && head < 1) {
        const k = Math.min(ARC - 1, Math.floor(head * ARC));
        project(route.pts, k, a);
        project(route.pts, k + 1, b);
        const f = head * ARC - k;
        const vis = Math.min(a[2] ?? 0, b[2] ?? 0);
        if (vis > 0.02) {
          ctx.fillStyle = at(brightRamp, vis);
          ctx.beginPath();
          ctx.arc(
            lerp(a[0] ?? 0, b[0] ?? 0, f),
            lerp(a[1] ?? 0, b[1] ?? 0, f),
            2.2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }

    // Arrival rings.
    for (let k = pings.length - 1; k >= 0; k -= 1) {
      const ping = pings[k];
      if (!ping) continue;
      const t = (now - ping.t) / 700;
      if (t >= 1 || !c.motionSafe) {
        pings.splice(k, 1);
        continue;
      }
      const X = vx(ping.x, ping.z);
      const z1 = vz1(ping.x, ping.z);
      const Y = ping.y * cb - z1 * sbt;
      const Z = ping.y * sbt + z1 * cb;
      if (Z < 0.05) continue;
      ctx.strokeStyle = at(pingRamp, (1 - t) * 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx + X * R, cy - Y * R, 3 + t * 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Offices and their chips.
    const font = R < 110 ? 9 : 10;
    ctx.font = `600 ${font}px ${family}`;
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0.06em";
    let placedCount = 0;
    for (let i = 0; i < c.points.length; i += 1) {
      const x = officeV[i * 3] ?? 0;
      const y = officeV[i * 3 + 1] ?? 0;
      const z = officeV[i * 3 + 2] ?? 0;
      const X = vx(x, z);
      const z1 = vz1(x, z);
      const Y = y * cb - z1 * sbt;
      const Z = y * sbt + z1 * cb;
      officeX[i] = cx + X * R;
      officeY[i] = cy - Y * R;
      officeZ[i] = Z;
    }
    for (const i of order) {
      const p = c.points[i];
      if (!p) continue;
      const Z = officeZ[i] ?? -1;
      if (Z < 0.02) continue;
      const px = officeX[i] ?? 0;
      const py = officeY[i] ?? 0;
      const fade = smooth(0.02, 0.3, Z);
      const isSel = p.id === selected;
      // A card-coloured collar, so the pin reads on day and night alike.
      ctx.globalAlpha = fade;
      ctx.fillStyle = chipFill;
      ctx.beginPath();
      ctx.arc(px, py, isSel ? 4.4 : 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = at(pointRamp, fade);
      ctx.beginPath();
      ctx.arc(px, py, isSel ? 2.6 : 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = at(pointRamp, 0.55 * fade);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 5.5 + (isSel ? ring.x * 4 : 0), 0, Math.PI * 2);
      ctx.stroke();
      if (isSel) {
        ctx.strokeStyle = at(pointRamp, 0.22 * fade * ring.x);
        ctx.beginPath();
        ctx.arc(px, py, 5.5 + ring.x * 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Chips only where they read, and never on top of one another.
      const show = isSel ? fade : smooth(0.3, 0.55, Z);
      if (show < 0.05) continue;
      const text = p.name.toUpperCase();
      let tw = labelW.get(`${font}|${text}`);
      if (tw === undefined) {
        tw = ctx.measureText(text).width;
        labelW.set(`${font}|${text}`, tw);
      }
      const bw = tw + 10;
      const bh = font + 7;
      let bx = px + 8;
      if (bx + bw > w - 2) bx = px - 8 - bw;
      bx = clamp(bx, 2, Math.max(2, w - bw - 2));
      const by = clamp(py - bh / 2, 2, Math.max(2, h - bh - 2));
      let clash = false;
      for (let q = 0; q < placedCount * 4; q += 4) {
        if (
          bx < (placed[q] ?? 0) + (placed[q + 2] ?? 0) + 2 &&
          bx + bw + 2 > (placed[q] ?? 0) &&
          by < (placed[q + 1] ?? 0) + (placed[q + 3] ?? 0) + 2 &&
          by + bh + 2 > (placed[q + 1] ?? 0)
        ) {
          clash = true;
          break;
        }
      }
      if (clash) continue;
      placed[placedCount * 4] = bx;
      placed[placedCount * 4 + 1] = by;
      placed[placedCount * 4 + 2] = bw;
      placed[placedCount * 4 + 3] = bh;
      placedCount += 1;
      ctx.globalAlpha = show;
      ctx.fillStyle = chipFill;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.strokeStyle = at(pointRamp, isSel ? 0.45 : 0.15);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = chipText;
      ctx.fillText(text, bx + 5, by + bh / 2 + 0.5);
      ctx.globalAlpha = 1;
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const safe = c.motionSafe;
    // Time: the day sweeps the short way round on the drift spring.
    if (!safe || c.paused) {
      time.x = timeTarget;
      time.v = 0;
    } else {
      springTo(time, timeTarget, springs.drift, dt);
    }
    if (!dragging) {
      if (yawMode === "spring") {
        if (!safe || springTo(yaw, yawTarget, springs.glide, dt)) {
          yaw.x = yawTarget;
          yaw.v = 0;
          yawMode = "free";
        }
      } else {
        // A throw coasts and slows; the slow turn carries on underneath.
        const tau = lerp(0.15, 2.4, clamp01(c.momentum));
        yaw.x += (spinRate() + yaw.v) * dt;
        yaw.v *= Math.exp(-dt / tau);
        if (Math.abs(yaw.v) < 1e-3) yaw.v = 0;
      }
      if (!safe) {
        tip.x = tipTarget;
        tip.v = 0;
      } else {
        springTo(tip, tipTarget, springs.drift, dt);
      }
    }
    if (safe) springTo(ring, selected ? 1 : 0, springs.snap, dt);
    else ring.x = selected ? 1 : 0;
    if (!c.paused && safe) clock += dt;
    if (rising) {
      riseClock += dt;
      let done = true;
      for (const r of routes) {
        if (riseClock < r.delay) {
          done = false;
          continue;
        }
        if (!springTo(r.rise, 1, springs.glide, dt)) done = false;
      }
      if (done) rising = false;
    }
  };

  const moving = (now: number) => {
    const c = cfg;
    if (!c) return false;
    if (dragging) return true;
    if (!c.motionSafe) return false;
    return (
      yawMode === "spring" ||
      yaw.v !== 0 ||
      spinRate() !== 0 ||
      Math.abs(tip.x - tipTarget) > 1e-4 ||
      tip.v !== 0 ||
      Math.abs(time.x - timeTarget) > 1e-4 ||
      Math.abs(ring.x - (selected ? 1 : 0)) > 1e-3 ||
      rising ||
      pings.length > 0 ||
      now < flickerUntil ||
      (!c.paused && c.pulseSpeed > 0 && routes.length > 0)
    );
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!introduced) {
      // The routes rise the first time the globe is seen.
      introduced = true;
      rising = cfg.motionSafe;
      riseClock = 0;
      if (!cfg.motionSafe) for (const r of routes) r.rise.x = 1;
    }
    step(dt);
    draw(now);
    if (moving(now)) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const faceSelected = (c: Config, instant: boolean) => {
    const p = c.points.find((q) => q.id === selected);
    if (!p) {
      tipTarget = clamp(c.tilt, -30, 30) * DEG;
      return;
    }
    yawTarget = yaw.x + wrapPi(-p.lon * DEG - yaw.x);
    yaw.v = 0;
    yawMode = "spring";
    tipTarget = clamp(p.lat * 0.75 * DEG, -TIP, TIP);
    if (instant) {
      yaw.x = yawTarget;
      tip.x = tipTarget;
      tip.v = 0;
      yawMode = "free";
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
      if (!was) {
        selected = next.selected;
        time.x = next.timeOfDay;
        timeTarget = next.timeOfDay;
      }
      rebuildWorld(next);
      rebuildRoutes(next);
      placeOffices(next);
      if (!was) {
        readColours();
        layout();
        tipTarget = clamp(next.tilt, -30, 30) * DEG;
        tip.x = tipTarget;
        // Open on the offices: the middle of their spread faces you.
        const lons = next.points.map((p) => p.lon);
        const mid = lons.length
          ? (Math.min(...lons) + Math.max(...lons)) / 2
          : 0;
        yaw.x = -mid * DEG;
        if (selected) faceSelected(next, true);
        if (!next.motionSafe) for (const r of routes) r.rise.x = 1;
        draw(performance.now());
        kick();
        return;
      }
      if (was.dpr !== next.dpr || was.arcHeight !== next.arcHeight) layout();
      if (was.colorKey !== next.colorKey) readColours();
      if (was.timeOfDay !== next.timeOfDay) {
        const delta = wrapPi(((next.timeOfDay - time.x) / 24) * Math.PI * 2);
        timeTarget = time.x + (delta / (Math.PI * 2)) * 24;
      }
      if (was.tilt !== next.tilt && !selected) {
        tipTarget = clamp(next.tilt, -30, 30) * DEG;
      }
      if (was.selected !== next.selected) {
        selected = next.selected;
        faceSelected(next, !next.motionSafe);
      }
      if (!next.motionSafe) {
        yaw.v = 0;
        for (const r of routes) r.rise.x = 1;
        rising = false;
      }
      draw(performance.now());
      kick();
    },
    resize() {
      const c = cfg;
      if (!c || !ctx) return;
      const d = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (w === root.clientWidth && h === root.clientHeight && d === dpr)
        return;
      layout();
      draw(performance.now());
      kick();
    },
    readColours() {
      readColours();
      draw(performance.now());
    },
    wake() {
      draw(performance.now());
      kick();
    },
    grab() {
      dragging = true;
      grabYaw = yaw.x;
      grabTip = tip.x;
      yaw.v = 0;
      tip.v = 0;
      yawMode = "free";
      kick();
    },
    drag(dx, dy) {
      // One globe radius of travel is one radian; the tip rubber-bands.
      yaw.x = grabYaw + dx / R;
      const raw = grabTip + dy / R;
      tip.x =
        raw > TIP
          ? TIP + rubberband(raw - TIP, 1)
          : raw < -TIP
            ? -TIP + rubberband(raw + TIP, 1)
            : raw;
      draw(performance.now());
      kick();
    },
    drop(vx2, vy2) {
      dragging = false;
      tipTarget = clamp(tip.x, -TIP, TIP);
      if (cfg?.motionSafe) {
        yaw.v = clamp(vx2 / R, -9, 9);
        tip.v = clamp(vy2 / R, -4, 4);
      } else {
        tip.x = tipTarget;
      }
      kick();
    },
    hit(x, y) {
      const c = cfg;
      if (!c) return null;
      let best: string | null = null;
      let gap = 16;
      for (let i = 0; i < c.points.length; i += 1) {
        const p = c.points[i];
        if (!p || (officeZ[i] ?? -1) < 0.05) continue;
        const d = Math.hypot((officeX[i] ?? 0) - x, (officeY[i] ?? 0) - y);
        if (d < gap) {
          gap = d;
          best = p.id;
        }
      }
      return best;
    },
    turn(dyaw, dtilt) {
      const c = cfg;
      if (!c) return;
      const base = yawMode === "spring" ? yawTarget : yaw.x;
      yawTarget = base + dyaw;
      yaw.v = 0;
      yawMode = "spring";
      tipTarget = clamp(tipTarget + dtilt, -TIP, TIP);
      if (!c.motionSafe) {
        yaw.x = yawTarget;
        tip.x = tipTarget;
        yawMode = "free";
        draw(performance.now());
      }
      kick();
    },
    face() {
      const c = cfg;
      if (!c) return;
      const target =
        c.points.find((q) => q.id === selected) ?? c.points[0] ?? null;
      if (!target) return;
      yawTarget = yaw.x + wrapPi(-target.lon * DEG - yaw.x);
      yawMode = "spring";
      tipTarget = clamp(target.lat * 0.75 * DEG, -TIP, TIP);
      if (!c.motionSafe) {
        yaw.x = yawTarget;
        tip.x = tipTarget;
        yawMode = "free";
        draw(performance.now());
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* ------------------------------ server frame ----------------------------- */

/**
 * The night half of the disc as an SVG path for the server's frame: the
 * terminator's visible half-ellipse closed along the dark limb. Every
 * coordinate is rounded, so Node and the browser write the same string.
 */
function nightPath(
  timeOfDay: number,
  season: number,
  tilt: number,
  yawDeg: number,
): string {
  const sun = sunAt(timeOfDay, season);
  const yw = yawDeg * DEG;
  const tb = clamp(tilt, -30, 30) * DEG;
  const x1 = sun[0] * Math.cos(yw) + sun[2] * Math.sin(yw);
  const z1 = -sun[0] * Math.sin(yw) + sun[2] * Math.cos(yw);
  const S = [
    x1,
    sun[1] * Math.cos(tb) - z1 * Math.sin(tb),
    sun[1] * Math.sin(tb) + z1 * Math.cos(tb),
  ] as const;
  const flat = Math.hypot(S[0], S[1]);
  const f = (x: number, y: number) => `${r2(x * 100)} ${r2(-y * 100)}`;
  if (flat < 1e-3) {
    return S[2] < 0
      ? "M -100 0 A 100 100 0 1 0 100 0 A 100 100 0 1 0 -100 0 Z"
      : "";
  }
  // Where the terminator meets the limb, and the half of it facing you.
  const a0 = Math.atan2(-S[0], S[1]);
  const u = [Math.cos(a0), Math.sin(a0), 0] as const;
  let wv = [
    S[1] * u[2] - S[2] * u[1],
    S[2] * u[0] - S[0] * u[2],
    S[0] * u[1] - S[1] * u[0],
  ];
  const wl = Math.hypot(wv[0] ?? 0, wv[1] ?? 0, wv[2] ?? 0) || 1;
  wv = wv.map((v) => v / wl);
  if ((wv[2] ?? 0) < 0) wv = wv.map((v) => -v);
  const parts: string[] = [];
  for (let k = 0; k <= 24; k += 1) {
    const p = (k / 24) * Math.PI;
    parts.push(
      `${k === 0 ? "M" : "L"} ${f(
        Math.cos(p) * u[0] + Math.sin(p) * (wv[0] ?? 0),
        Math.cos(p) * u[1] + Math.sin(p) * (wv[1] ?? 0),
      )}`,
    );
  }
  // Back round the dark limb, from −u to u through the side away from the sun.
  const am = Math.atan2(-S[1], -S[0]);
  const start = a0 + Math.PI;
  const dir = Math.sin(am - start) >= 0 ? 1 : -1;
  for (let k = 1; k <= 24; k += 1) {
    const a = start + (dir * k * Math.PI) / 24;
    parts.push(`L ${f(Math.cos(a), Math.sin(a))}`);
  }
  return `${parts.join(" ")} Z`;
}

/* ------------------------------- component ------------------------------- */

/**
 * An invented world as a dotted globe with a day side and a night side. The
 * continents are seeded noise on the sphere (every office stands on land), the
 * body is shaded per pixel with a soft terminator and a warm twilight band, and
 * on the dark half the cities glow. Change `timeOfDay` and the day sweeps
 * round the globe on springs.drift while every city switches on with its own
 * flicker as night reaches it. Routes between offices rise as arcs on
 * springs.glide the first time the globe is seen, then pulses of light ride
 * them and ring out on arrival.
 *
 * The globe turns slowly on its own; drag turns it 1:1 and tips it (rubber-
 * banded), a throw coasts by `momentum`. Clicking an office brings it round on
 * glide and holds it there. Arrow keys turn and tip, Page Up and Page Down
 * step through the offices, Home faces one, Escape lets it turn again. Under
 * reduced motion nothing turns or flickers on its own: arcs are drawn whole,
 * the lights are simply on, and every turn is an instant step.
 */
export function NightSide({
  points = defaultNightSidePoints,
  routes = defaultNightSideRoutes,
  timeOfDay = 18,
  arcHeight = 0.45,
  dotDensity = 66,
  season = 14,
  tilt = 16,
  spin = 5,
  momentum = 0.6,
  pulseSpeed = 1,
  lights = 0.8,
  colors,
  value,
  defaultValue = null,
  onValueChange,
  interactive = true,
  paused = false,
  seed = 3,
  dpr = 2,
  label = "Offices around the world",
  className,
}: NightSideProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const selected = value === undefined ? own : value;
  const [said, setSaid] = React.useState("");

  const palette = { ...DEFAULT_COLORS, ...colors };
  const inkList = [
    palette.day,
    palette.night,
    palette.land,
    palette.lights,
    palette.routes,
    palette.points,
    "var(--card)",
    "var(--foreground)",
    "var(--accent-bright)",
  ];
  const colorKey = inkList.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const config: Config = {
    points,
    routes,
    timeOfDay: mod(timeOfDay, 24),
    arcHeight,
    dotDensity,
    season,
    tilt,
    spin,
    momentum,
    pulseSpeed,
    lights,
    interactive,
    paused,
    seed,
    dpr,
    colorKey,
    selected,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 9) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.readColours();
    });
    return () => {
      live = false;
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

  const sentence = (id: string | null) => {
    if (id === null) return "No office selected; the globe turns again.";
    const p = points.find((q) => q.id === id);
    if (!p) return "";
    const r = nightSideReading(p, mod(timeOfDay, 24), season);
    return `${p.name}, ${r.time} local time, ${r.phase}.`;
  };

  const commit = (id: string | null) => {
    if (id === selected) return;
    if (value === undefined) setOwn(id);
    setSaid(sentence(id));
    onValueChange?.(id);
  };

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !interactive,
    onStart: () => engine.current?.grab(),
    onMove: ({ offset }) => engine.current?.drag(offset.x, offset.y),
    onEnd: ({ velocity }) => engine.current?.drop(velocity.x, velocity.y),
    onCancel: () => engine.current?.drop(0, 0),
    onTap: (event) => {
      const { x, y } = local(event);
      commit(engine.current?.hit(x, y) ?? null);
    },
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!interactive || event.buttons) return;
    const { x, y } = local(event);
    event.currentTarget.style.cursor = engine.current?.hit(x, y)
      ? "pointer"
      : "";
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const e = engine.current;
    const index = points.findIndex((p) => p.id === selected);
    const handled = (() => {
      switch (event.key) {
        case "ArrowLeft":
          e?.turn(-20 * DEG, 0);
          return true;
        case "ArrowRight":
          e?.turn(20 * DEG, 0);
          return true;
        case "ArrowUp":
          e?.turn(0, -8 * DEG);
          return true;
        case "ArrowDown":
          e?.turn(0, 8 * DEG);
          return true;
        case "PageDown":
        case "PageUp": {
          if (!points.length) return false;
          const stepBy = event.key === "PageDown" ? 1 : -1;
          const from = index < 0 ? (stepBy > 0 ? -1 : 0) : index;
          const next = points[mod(from + stepBy, points.length)];
          if (next) commit(next.id);
          return true;
        }
        case "Home":
          e?.face();
          return true;
        case "Escape":
          if (selected === null) return false;
          commit(null);
          return true;
        default:
          return false;
      }
    })();
    if (handled) event.preventDefault();
  };

  const hour = mod(timeOfDay, 24);
  const readings = points.map((p) => ({
    point: p,
    reading: nightSideReading(p, hour, season),
  }));
  const dark = readings
    .filter((r) => r.reading.phase === "night")
    .map((r) => r.point.name);
  const clockMinutes = mod(Math.round(hour * 60), 1440);
  const clockText = `${String(Math.floor(clockMinutes / 60)).padStart(2, "0")}:${String(clockMinutes % 60).padStart(2, "0")}`;
  const name = `${label}, ${clockText} at the prime meridian; ${
    dark.length === 0
      ? "every office in daylight or twilight"
      : dark.length === points.length
        ? "night over every office"
        : `night over ${dark.join(", ")}`
  }.`;

  const lons = points.map((p) => p.lon);
  const midLon = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : 0;
  const night = nightPath(hour, season, tilt, -midLon);

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="globe"
      aria-label={name}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      {...(interactive ? drag : {})}
      onPointerMove={interactive ? onPointerMove : undefined}
      className={cn(
        "group/night-side relative isolate h-60 w-full overflow-clip rounded-3 outline-none select-none",
        interactive && "cursor-grab touch-none active:cursor-grabbing",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="-125 -125 250 250"
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/night-side:opacity-0"
      >
        <circle
          r="100"
          style={{ fill: palette.day, stroke: "var(--hairline-strong)" }}
        />
        {night ? <path d={night} style={{ fill: palette.night }} /> : null}
        <circle
          r="104"
          fill="none"
          style={{ stroke: "var(--accent-bright)" }}
          strokeOpacity={0.22}
          strokeWidth="3"
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full font-mono"
      />
      {inkList.map((ink, i) => (
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
      {interactive ? (
        <span id={hintId} className="sr-only">
          Drag or use the arrow keys to turn and tip the globe. Page Up and Page
          Down bring each office to the front, Home faces it, Escape lets the
          globe turn again.
        </span>
      ) : null}
      <ul className="sr-only">
        {readings.map(({ point, reading }) => (
          <li key={point.id}>
            {`${point.name}: ${reading.time} local time, ${reading.phase}.`}
          </li>
        ))}
      </ul>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
