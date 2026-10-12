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
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SwitchbackTrailsProps = {
  /** Exposure compensation, EV −2 (faint streaks) to +2 (blown rivers of light). @default 0 */
  exposure?: number;
  /** How busy the road is, 0 (an empty pass) to 1 (a steady stream). @default 0.5 */
  traffic?: number;
  /** The light, 0 (last warm light) to 1 (deep blue hour with stars). @default 0.55 */
  dusk?: number;
  /** Controlled: the shutter is open. */
  open?: boolean;
  /** Whether the shutter starts open when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, release or key that opened or closed the shutter. */
  onOpenChange?: (open: boolean) => void;
  /** Fires as the shutter closes, with how long it was open and how many cars drew a trail. */
  onExpose?: (shot: { seconds: number; cars: number }) => void;
  /** How long the developed photograph takes to fade back to the live view, ms. @default 6000 */
  fade?: number;
  /** The halation bloom as the photograph develops. @default true */
  develop?: boolean;
  /** How fast the cars drive, 0.5 to 2. @default 1 */
  speed?: number;
  /** The shutter closes by itself after this long, seconds. @default 30 */
  maxExposure?: number;
  /** Headlights and tail lights, CSS colours. @default warm white and red pigments */
  lightColors?: [string, string];
  /** Stars come out as the dusk deepens. @default true */
  stars?: boolean;
  /** Hold the live traffic still (an open shutter still records). @default false */
  paused?: boolean;
  /** Seeds the mountains, the traffic and the stars. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The control's accessible name. @default "Hold to open the shutter" */
  label?: string;
  /** No pressing or keys; the view dims. @default false */
  disabled?: boolean;
  /** Sizes the view; it fills its parent by default. */
  className?: string;
};

/* --------------------------------- colours -------------------------------- */

const SCENE = [
  "oklch(from var(--accent) 0.44 0.08 calc(h + 34))", // 0 sky top, warm
  "oklch(from var(--accent) 0.15 0.05 h)", // 1 sky top, deep
  "oklch(from var(--warn) 0.8 0.11 calc(h - 34))", // 2 horizon, warm
  "oklch(from var(--accent) 0.34 0.08 calc(h + 22))", // 3 horizon, deep
  "oklch(from var(--accent) 0.32 0.05 calc(h + 18))", // 4 far ridge
  "oklch(from var(--accent) 0.17 0.03 h)", // 5 the mountain face
  "oklch(from var(--accent) 0.27 0.02 h)", // 6 the road
  "oklch(from var(--success) 0.13 0.03 h)", // 7 trees
  "oklch(from var(--warn) 0.86 0.13 h)", // 8 village lamps
  "oklch(from var(--ink) 0.96 0.01 h)", // 9 stars
] as const;
const DEFAULT_LIGHTS: [string, string] = [
  "oklch(from var(--warn) 0.97 0.045 h)",
  "oklch(from var(--danger) 0.62 0.24 h)",
];

/* ----------------------------------- road ---------------------------------- */

const BOX_W = 1200;
const BOX_H = 400;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

type Road = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  /** Nearness, 0.3 (far up the face) to 1 (the lowest leg). */
  k: Float32Array;
  /** How much a car slows here: 1 on a straight, lower round a hairpin. */
  slow: Float32Array;
  step: number;
  length: number;
};

const LEGS = 6;

/** The road down the face: legs that widen as they come nearer, joined by hairpins. */
function buildRoad(): Road {
  const dense: [number, number][] = [];
  const line = (a: [number, number], b: [number, number]) => {
    for (let t = 0; t <= 1; t += 0.02)
      dense.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
  };
  const bez = (
    a: [number, number],
    b: [number, number],
    c: [number, number],
    d: [number, number],
  ) => {
    for (let t = 0; t <= 1; t += 0.02) {
      const u = 1 - t;
      dense.push([
        u * u * u * a[0] +
          3 * u * u * t * b[0] +
          3 * u * t * t * c[0] +
          t * t * t * d[0],
        u * u * u * a[1] +
          3 * u * u * t * b[1] +
          3 * u * t * t * c[1] +
          t * t * t * d[1],
      ]);
    }
  };
  const yAt = (i: number) => 116 + 262 * Math.pow(i / (LEGS - 1), 1.18);
  const half = (i: number) => 80 + 230 * (i / (LEGS - 1));
  const mid = (i: number) => 720 - 46 * i;
  let prev: [number, number] | null = null;
  for (let i = 0; i < LEGS; i += 1) {
    const y = yAt(i);
    const leftward = i % 2 === 0;
    const start: [number, number] = [
      mid(i) + (leftward ? half(i) : -half(i)),
      y,
    ];
    const end: [number, number] = [
      mid(i) + (leftward ? -half(i) : half(i)),
      y + 6 + i * 2,
    ];
    if (prev === null) {
      // The road comes over the shoulder of the mountain.
      line([start[0] + 70, y - 34], start);
    } else {
      const drop = start[1] - prev[1];
      const out = (leftward ? 1 : -1) * drop * 0.78;
      bez(
        prev,
        [prev[0] + out, prev[1] + drop * 0.05],
        [start[0] + out, start[1] - drop * 0.05],
        start,
      );
    }
    line(start, end);
    prev = end;
  }
  if (prev) line(prev, [prev[0] + (LEGS % 2 === 0 ? 240 : -240), prev[1] + 40]);

  // Resample evenly by arc length.
  const step = 1.6;
  const xs: number[] = [];
  const ys: number[] = [];
  let carry = 0;
  for (let i = 1; i < dense.length; i += 1) {
    const a = dense[i - 1];
    const b = dense[i];
    if (!a || !b) continue;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = carry;
    while (d < seg) {
      const t = d / seg;
      xs.push(lerp(a[0], b[0], t));
      ys.push(lerp(a[1], b[1], t));
      d += step;
    }
    carry = d - seg;
  }
  const n = xs.length;
  const x = Float32Array.from(xs);
  const y = Float32Array.from(ys);
  const nx = new Float32Array(n);
  const ny = new Float32Array(n);
  const k = new Float32Array(n);
  const slow = new Float32Array(n);
  const angle = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    const tx = (x[b] ?? 0) - (x[a] ?? 0);
    const ty = (y[b] ?? 0) - (y[a] ?? 0);
    const l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l;
    ny[i] = tx / l;
    angle[i] = Math.atan2(ty, tx);
    k[i] = 0.3 + 0.7 * clamp01(((y[i] ?? 0) - 100) / 290);
  }
  for (let i = 0; i < n; i += 1) {
    const a = angle[Math.max(0, i - 12)] ?? 0;
    const b = angle[Math.min(n - 1, i + 12)] ?? 0;
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    slow[i] = 1 - 0.58 * clamp01(turn / 1.4);
  }
  return { n, x, y, nx, ny, k, slow, step, length: n * step };
}

const ROAD = buildRoad();

/** The road as an SVG path, for the server's still. */
const ROAD_PATH = (() => {
  const parts: string[] = [];
  for (let i = 0; i < ROAD.n; i += 4) {
    parts.push(
      `${i === 0 ? "M" : "L"}${r1(ROAD.x[i] ?? 0)} ${r1(ROAD.y[i] ?? 0)}`,
    );
  }
  return parts.join(" ");
})();

/** A trail beside the road for the still: offset along the normal. */
const trailPath = (offset: number) => {
  const parts: string[] = [];
  for (let i = 0; i < ROAD.n; i += 4) {
    const k = ROAD.k[i] ?? 1;
    const px = (ROAD.x[i] ?? 0) + (ROAD.nx[i] ?? 0) * offset * k;
    const py = (ROAD.y[i] ?? 0) + (ROAD.ny[i] ?? 0) * offset * k;
    parts.push(`${i === 0 ? "M" : "L"}${r1(px)} ${r1(py)}`);
  }
  return parts.join(" ");
};
const TRAIL_WHITE = trailPath(2.6);
const TRAIL_RED = trailPath(-2.6);

/** A ridge line, seeded. */
function ridge(
  seed: number,
  base: number,
  amp: number,
  steps: number,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * BOX_W;
    const y =
      base -
      amp * (0.55 + 0.45 * Math.sin(i * 0.9 + seed)) -
      (hash(seed, i) - 0.5) * amp * 0.5;
    pts.push([x, y]);
  }
  return pts;
}

/** The mountain face the road climbs: a peak left of centre, falling away right. */
const FACE: [number, number][] = [
  [0, 400],
  [0, 210],
  [140, 170],
  [300, 120],
  [430, 86],
  [520, 66],
  [600, 78],
  [690, 70],
  [780, 92],
  [900, 132],
  [1040, 176],
  [1200, 214],
  [1200, 400],
];
const FACE_PATH = `M${FACE.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

/* --------------------------------- engine --------------------------------- */

type Config = {
  exposure: number;
  traffic: number;
  dusk: number;
  fade: number;
  develop: boolean;
  speed: number;
  maxExposure: number;
  stars: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Phase = "live" | "open" | "developing" | "holding" | "fading";

const CARS = 64;
const DEVELOP_MS = 650;
const HOLD_MS = 1400;

type Engine = {
  configure: (cfg: Config) => void;
  shutter: (open: boolean) => { seconds: number; cars: number } | null;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  dispose: () => void;
};

/** Any CSS colour the canvas understands, as 0–255 sRGB, by painting one pixel. */
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

const rgb = (c: [number, number, number]) =>
  `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
const mixRgb = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  readout: { current: HTMLSpanElement | null },
  visible: { current: boolean },
  onAutoClose: () => void,
): Engine {
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  const read = rgbReader();
  let scene: [number, number, number][] = [];
  let head = "white";
  let tail = "red";
  let headSprite: HTMLCanvasElement | null = null;
  let tailSprite: HTMLCanvasElement | null = null;
  const size = { w: 0, h: 0, dpr: 1, s: 1, ox: 0, oy: 0 };
  let ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
  const bg = document.createElement("canvas");
  const film = document.createElement("canvas");
  const bloom = document.createElement("canvas");

  // Cars: position along the road, direction, speed, and last light positions.
  const cs = new Float32Array(CARS);
  const cdir = new Int8Array(CARS);
  const cv = new Float32Array(CARS);
  const calive = new Uint8Array(CARS);
  const cdrew = new Uint8Array(CARS);
  const px = new Float32Array(CARS * 4);
  const fresh = new Float32Array(4);
  const scratch = new Float32Array(4);
  let rand = 0;
  let nextDown = 0;
  let nextUp = 0;

  let phase: Phase = "live";
  let openedAt = 0;
  let phaseAt = 0;
  let heldMs = 0;
  let filmAlpha = 0;

  const random = () => {
    rand += 1;
    return hash(Math.round(cfg?.seed ?? 5) * 977 + 13, rand);
  };

  const at = (s: number) => clamp(Math.floor(s / ROAD.step), 0, ROAD.n - 1);

  /** Both lights of a car, in box units: the lane by direction, the pair across it. */
  const lights = (i: number, out: Float32Array) => {
    const j = at(cs[i] ?? 0);
    const k = ROAD.k[j] ?? 1;
    const lane = (cdir[i] ?? 1) > 0 ? 2.6 : -2.6;
    const x = ROAD.x[j] ?? 0;
    const y = ROAD.y[j] ?? 0;
    const nx = ROAD.nx[j] ?? 0;
    const ny = ROAD.ny[j] ?? 0;
    out[0] = x + nx * (lane - 0.8) * k;
    out[1] = y + ny * (lane - 0.8) * k;
    out[2] = x + nx * (lane + 0.8) * k;
    out[3] = y + ny * (lane + 0.8) * k;
  };

  const spawn = (dir: 1 | -1, s?: number) => {
    for (let i = 0; i < CARS; i += 1) {
      if (calive[i]) continue;
      calive[i] = 1;
      cdir[i] = dir;
      cs[i] = s ?? (dir > 0 ? 0 : ROAD.length - 1);
      cv[i] = 200 + random() * 70;
      cdrew[i] = 0;
      lights(i, fresh);
      px.set(fresh, i * 4);
      return;
    }
  };

  /** Cars a second, each way. */
  const rate = () => clamp01(cfg?.traffic ?? 0.5) * 0.8;

  const populate = () => {
    calive.fill(0);
    rand = 0;
    const c = cfg;
    if (!c) return;
    // The road as it would be after a while: cars spread along it.
    const mean = (rate() * ROAD.length) / 150;
    const count = Math.round(mean);
    for (let i = 0; i < count; i += 1) {
      spawn(1, random() * ROAD.length);
      spawn(-1, random() * ROAD.length);
    }
    nextDown = (-Math.log(1 - random()) / Math.max(0.01, rate())) * 1000;
    nextUp = (-Math.log(1 - random()) / Math.max(0.01, rate())) * 1000;
  };

  /** Moves every car `dt` seconds; draws its trail into the film when asked. */
  const drive = (dt: number, record: boolean, gain: number) => {
    const c = cfg;
    if (!c) return;
    const fctx = film.getContext("2d");
    if (record && fctx) {
      fctx.setTransform(
        size.s * size.dpr,
        0,
        0,
        size.s * size.dpr,
        size.ox * size.dpr,
        size.oy * size.dpr,
      );
      fctx.globalCompositeOperation = "lighter";
      // Butt ends: round caps overlap at every joint and bead an additive trail.
      fctx.lineCap = "butt";
    }
    const tmp = scratch;
    for (let i = 0; i < CARS; i += 1) {
      if (!calive[i]) continue;
      const j = at(cs[i] ?? 0);
      const k = ROAD.k[j] ?? 1;
      const v =
        (cv[i] ?? 80) * clamp(c.speed, 0.5, 2) * k * (ROAD.slow[j] ?? 1);
      cs[i] = (cs[i] ?? 0) + (cdir[i] ?? 1) * v * dt;
      if ((cs[i] ?? 0) < 0 || (cs[i] ?? 0) >= ROAD.length) {
        calive[i] = 0;
        continue;
      }
      lights(i, tmp);
      if (record && fctx) {
        const o = i * 4;
        // Widths are set in screen pixels, so a trail reads at any size: a
        // soft halo first, then the bright core.
        const unit = 1 / Math.max(0.05, size.s);
        const core =
          (0.7 + 1.3 * k) * (1 + 0.18 * Math.max(0, c.exposure)) * unit;
        const alpha = clamp01(gain * ((cdir[i] ?? 1) > 0 ? 0.95 : 1));
        fctx.strokeStyle = (cdir[i] ?? 1) > 0 ? head : tail;
        for (let pass = 0; pass < 2; pass += 1) {
          fctx.globalAlpha = pass === 0 ? alpha * 0.22 : alpha;
          fctx.lineWidth = pass === 0 ? core * 3.2 : core;
          fctx.beginPath();
          fctx.moveTo(px[o] ?? 0, px[o + 1] ?? 0);
          fctx.lineTo(tmp[0] ?? 0, tmp[1] ?? 0);
          fctx.moveTo(px[o + 2] ?? 0, px[o + 3] ?? 0);
          fctx.lineTo(tmp[2] ?? 0, tmp[3] ?? 0);
          fctx.stroke();
        }
        cdrew[i] = 1;
      }
      px.set(tmp, i * 4);
    }
    if (record && fctx) {
      fctx.globalAlpha = 1;
      fctx.globalCompositeOperation = "source-over";
    }
    // New arrivals at the top and the bottom, at random intervals.
    nextDown -= dt * 1000;
    nextUp -= dt * 1000;
    const r = Math.max(0.01, rate());
    if (nextDown <= 0) {
      if (c.traffic > 0) spawn(1);
      nextDown = (-Math.log(1 - random()) / r) * 1000;
    }
    if (nextUp <= 0) {
      if (c.traffic > 0) spawn(-1);
      nextUp = (-Math.log(1 - random()) / r) * 1000;
    }
  };

  const gainOf = () => 0.42 * Math.pow(2, clamp(cfg?.exposure ?? 0, -2, 2));

  /** The dusk view, painted once per size, tone and theme. */
  const paintScene = () => {
    const c = cfg;
    if (!c || scene.length < 10) return;
    bg.width = canvas.width;
    bg.height = canvas.height;
    const g = bg.getContext("2d");
    if (!g) return;
    const d = clamp01(c.dusk);
    const col = (i: number) => scene[i] ?? [0, 0, 0];
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, bg.height);
    sky.addColorStop(0, rgb(mixRgb(col(0), col(1), d)));
    sky.addColorStop(0.42, rgb(mixRgb(col(2), col(3), d)));
    sky.addColorStop(1, rgb(mixRgb(col(2), col(3), d)));
    g.fillStyle = sky;
    g.fillRect(0, 0, bg.width, bg.height);
    g.setTransform(
      size.s * size.dpr,
      0,
      0,
      size.s * size.dpr,
      size.ox * size.dpr,
      size.oy * size.dpr,
    );
    const seed = Math.round(c.seed);
    if (c.stars && d > 0.3) {
      g.fillStyle = rgb(col(9));
      for (let i = 0; i < 90; i += 1) {
        g.globalAlpha = (d - 0.3) * (0.4 + hash(seed + 7, i) * 0.6);
        const sx = hash(seed + 8, i) * BOX_W;
        const sy = hash(seed + 9, i) * 150;
        g.fillRect(sx, sy, 1.1, 1.1);
      }
      g.globalAlpha = 1;
    }
    const fill = (pts: [number, number][], colour: string, base: number) => {
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(0, base);
      for (const [x, y] of pts) g.lineTo(x, y);
      g.lineTo(BOX_W, base);
      g.closePath();
      g.fill();
    };
    const far = mixRgb(col(4), mixRgb(col(2), col(3), d), 0.35);
    fill(ridge(seed, 186, 46, 14), rgb(far), 400);
    fill(ridge(seed + 3, 224, 38, 18), rgb(mixRgb(col(4), col(5), 0.55)), 400);
    g.fillStyle = rgb(col(5));
    g.fill(new Path2D(FACE_PATH));
    // The road, barely there at dusk.
    g.strokeStyle = rgb(col(6));
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    for (let i = 0; i < ROAD.n; i += 2) {
      if (i === 0) g.moveTo(ROAD.x[i] ?? 0, ROAD.y[i] ?? 0);
      else g.lineTo(ROAD.x[i] ?? 0, ROAD.y[i] ?? 0);
    }
    for (let w = 0; w < 2; w += 1) {
      g.lineWidth = 2.2 + w * 2.6;
      g.globalAlpha = 0.32 - w * 0.12;
      g.stroke();
    }
    g.globalAlpha = 1;
    // Firs on the face, and a few lamps in the village below.
    g.fillStyle = rgb(col(7));
    for (let i = 0; i < 70; i += 1) {
      const tx = 60 + hash(seed + 11, i) * 1080;
      const ty = 150 + hash(seed + 12, i) * 240;
      const sz = 3 + ((ty - 150) / 240) * 9;
      g.beginPath();
      g.moveTo(tx, ty - sz * 2);
      g.lineTo(tx + sz * 0.7, ty);
      g.lineTo(tx - sz * 0.7, ty);
      g.closePath();
      g.fill();
    }
    g.fillStyle = rgb(col(8));
    for (let i = 0; i < 9; i += 1) {
      g.globalAlpha = 0.6 + hash(seed + 13, i) * 0.4;
      g.beginPath();
      g.arc(
        70 + hash(seed + 14, i) * 220,
        372 + hash(seed + 15, i) * 24,
        1.4,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    g.globalAlpha = 1;
  };

  const sprite = (colour: [number, number, number]) => {
    const s = document.createElement("canvas");
    s.width = 32;
    s.height = 32;
    const g = s.getContext("2d");
    if (!g) return s;
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgb(255, 255, 255)");
    grd.addColorStop(0.22, rgb(colour));
    grd.addColorStop(1, `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, 0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    return s;
  };

  const readColours = () => {
    const kids = carriers.children;
    scene = [];
    for (let i = 0; i < kids.length; i += 1) {
      const el = kids[i];
      if (el) scene.push(read(getComputedStyle(el).color));
    }
    const h = scene[10] ?? [255, 240, 220];
    const t = scene[11] ?? [230, 40, 40];
    head = rgb(h);
    tail = rgb(t);
    headSprite = sprite(h);
    tailSprite = sprite(t);
    paintScene();
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || canvas.width < 2) return;
    const now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    const held = phase === "open" ? now - openedAt : heldMs;
    const lift =
      (1 - Math.exp(-held / 7000)) * 0.32 * clamp(gainOf(), 0.2, 1.4);
    const showFilm = phase !== "live";
    if (showFilm) {
      ctx.globalCompositeOperation = "lighter";
      // A long exposure lifts the whole sky a little.
      ctx.globalAlpha = lift * filmAlpha;
      ctx.drawImage(bg, 0, 0);
      ctx.globalAlpha = filmAlpha;
      ctx.drawImage(film, 0, 0);
      if (phase !== "open" && c.develop && c.motionSafe) {
        const since = now - phaseAt;
        const swell =
          phase === "developing"
            ? Math.sin(clamp01(since / DEVELOP_MS) * Math.PI * 0.5) * 0.85
            : 0.85;
        ctx.globalAlpha = swell * filmAlpha;
        ctx.drawImage(bloom, 0, 0);
      }
    }
    // The live view: the cars' lights themselves.
    if (c.motionSafe && phase !== "open") {
      ctx.globalCompositeOperation = "lighter";
      ctx.setTransform(
        size.s * size.dpr,
        0,
        0,
        size.s * size.dpr,
        size.ox * size.dpr,
        size.oy * size.dpr,
      );
      const live = 1 - (showFilm ? filmAlpha * 0.6 : 0);
      for (let i = 0; i < CARS; i += 1) {
        if (!calive[i]) continue;
        const k = ROAD.k[at(cs[i] ?? 0)] ?? 1;
        const spr = (cdir[i] ?? 1) > 0 ? headSprite : tailSprite;
        if (!spr) continue;
        const r = (1.4 + 1.8 * k) / Math.max(0.4, size.s * 1.6);
        ctx.globalAlpha = 0.85 * live;
        const o = i * 4;
        ctx.drawImage(
          spr,
          (px[o] ?? 0) - r,
          (px[o + 1] ?? 0) - r,
          r * 2,
          r * 2,
        );
        ctx.drawImage(
          spr,
          (px[o + 2] ?? 0) - r,
          (px[o + 3] ?? 0) - r,
          r * 2,
          r * 2,
        );
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (readout.current) {
      readout.current.textContent =
        phase === "open"
          ? `${(held / 1000).toFixed(1)} s`
          : phase === "developing" || phase === "holding"
            ? "developing"
            : phase === "fading"
              ? `${(heldMs / 1000).toFixed(1)} s`
              : "hold";
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const clearFilm = () => {
    const f = film.getContext("2d");
    if (!f) return;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, film.width, film.height);
  };

  const step = (now: number) => {
    const c = cfg;
    if (!c) return false;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (phase === "open") {
      if (c.motionSafe) {
        drive(dt, true, gainOf());
        filmAlpha = 1;
      } else {
        // The trails were laid down at once; they show more the longer you hold.
        filmAlpha = clamp01((now - openedAt) / 3500);
      }
      if ((now - openedAt) / 1000 >= Math.max(1, c.maxExposure)) onAutoClose();
      return true;
    }
    if (c.motionSafe && !c.paused) drive(dt, false, 0);
    if (phase === "developing" && now - phaseAt >= DEVELOP_MS) {
      phase = "holding";
      phaseAt = now;
    } else if (phase === "holding" && now - phaseAt >= HOLD_MS) {
      phase = "fading";
      phaseAt = now;
    } else if (phase === "fading") {
      const t = clamp01((now - phaseAt) / Math.max(200, c.fade));
      filmAlpha = 1 - t * t * (3 - 2 * t);
      if (t >= 1) {
        phase = "live";
        filmAlpha = 0;
        clearFilm();
      }
    }
    return phase !== "live" || (c.motionSafe && !c.paused && c.traffic > 0);
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    // Only live traffic is fine at thirty frames a second; an exposure is not.
    if (phase === "live" && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    drawnAt = now;
    const more = step(now);
    draw();
    if (more) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!c || w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const s = Math.max(w / BOX_W, h / BOX_H);
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    size.s = s;
    size.ox = (w - BOX_W * s) / 2;
    // Cropped top and bottom, the sky gives way: the hairpins stay in view.
    size.oy = h - BOX_H * s;
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    canvas.width = cw;
    canvas.height = ch;
    film.width = cw;
    film.height = ch;
    bloom.width = cw;
    bloom.height = ch;
    ctx = canvas.getContext("2d");
    if (phase !== "live") {
      phase = "live";
      filmAlpha = 0;
    }
    paintScene();
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
        populate();
        draw();
        kick();
        return;
      }
      if (was.dpr !== next.dpr) resize();
      if (was.colourKey !== next.colourKey) readColours();
      else if (
        was.dusk !== next.dusk ||
        was.stars !== next.stars ||
        was.seed !== next.seed
      )
        paintScene();
      if (was.seed !== next.seed) populate();
      draw();
      kick();
    },
    shutter(open) {
      const c = cfg;
      if (!c) return null;
      const now = performance.now();
      if (open) {
        if (phase === "open") return null;
        clearFilm();
        cdrew.fill(0);
        phase = "open";
        openedAt = now;
        filmAlpha = c.motionSafe ? 1 : 0;
        if (!c.motionSafe) {
          // Reduced motion: lay down a long exposure's trails at once.
          for (let t = 0; t < 12; t += 1 / 30)
            drive(1 / 30, true, gainOf() * 0.6);
        }
        kick();
        return null;
      }
      if (phase !== "open") return null;
      heldMs = now - openedAt;
      let cars = 0;
      for (let i = 0; i < CARS; i += 1) cars += cdrew[i] ?? 0;
      phase = "developing";
      phaseAt = now;
      filmAlpha = c.motionSafe ? 1 : Math.max(filmAlpha, 0.4);
      // The bloom is the film blurred once, kept for the develop.
      const b = bloom.getContext("2d");
      if (b && c.develop && c.motionSafe) {
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.clearRect(0, 0, bloom.width, bloom.height);
        b.filter = `blur(${Math.round(5 * size.dpr)}px)`;
        b.drawImage(film, 0, 0);
        b.filter = "none";
      }
      kick();
      return { seconds: Math.round(heldMs / 100) / 10, cars };
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

/* -------------------------------- component ------------------------------- */

/** The iris: six blades drawn as a hexagonal aperture that opens and closes. */
function Iris({ open, motionSafe }: { open: boolean; motionSafe: boolean }) {
  const r = useMotionValue(open ? 8.5 : 2.2);
  React.useEffect(() => {
    const to = open ? 8.5 : 2.2;
    const c: AnimationPlaybackControls = motionSafe
      ? open
        ? animate(r, to, springs.snap)
        : animate(r, to, { duration: durations.fast, ease: easings.exit })
      : animate(r, to, { duration: durations.fast, ease: easings.enter });
    return () => c.stop();
  }, [open, motionSafe, r]);
  const points = useTransform(r, (v) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + v * 0.12;
      return `${(12 + Math.cos(a) * v).toFixed(2)},${(12 + Math.sin(a) * v).toFixed(2)}`;
    }).join(" "),
  );
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.8"
      />
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
      <motion.polygon
        points={points}
        stroke="currentColor"
        strokeWidth="0.75"
        style={{ fill: "oklch(0.16 0.03 260)" }}
      />
    </svg>
  );
}

/**
 * A dusk view across a valley to a mountain face with a road zigzagging down
 * it in hairpins — the legs higher up farther away, shorter and thinner; far
 * ridges behind, firs on the face, stars as the dusk deepens and a few lamps
 * in the village below. Cars drive the road both ways: downhill a pair of
 * warm-white headlights, uphill a pair of red tail lights, each in its lane,
 * slowing into the hairpins and pulling out of them.
 *
 * Press and hold to open the shutter. An iris in the corner opens on the
 * springs.snap constants and a readout counts the seconds, and every car's
 * lights are drawn from where they were to where they are into an exposure
 * layer with additive light, so white and red trails build along the
 * hairpins — brighter where the cars slow — while the sky lifts as a long
 * exposure does. Release, and the iris closes on the exit ease and the
 * photograph develops: a halation bloom swells over 650 ms, the frame holds,
 * then fades slowly back to the live view. Space opens the shutter while
 * held, Enter toggles it, Escape closes it.
 */
export function SwitchbackTrails({
  exposure = 0,
  traffic = 0.5,
  dusk = 0.55,
  open,
  defaultOpen = false,
  onOpenChange,
  onExpose,
  fade = 6000,
  develop = true,
  speed = 1,
  maxExposure = 30,
  lightColors = DEFAULT_LIGHTS,
  stars = true,
  paused = false,
  seed = 5,
  dpr = 2,
  label = "Hold to open the shutter",
  disabled = false,
  className,
}: SwitchbackTrailsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const [said, setSaid] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const readoutRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const openNow = React.useRef(isOpen);
  const request = React.useRef<(next: boolean) => void>(() => {});

  const carried = [...SCENE, lightColors[0], lightColors[1]];
  const config: Config = {
    exposure,
    traffic,
    dusk,
    fade,
    develop,
    speed,
    maxExposure,
    stars,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey: carried.join("|"),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    openNow.current = isOpen;
    engine.current?.configure(config);
  });

  /** The shutter as shown follows the open state, from whoever changed it. */
  React.useEffect(() => {
    if (shown.current === isOpen) return;
    shown.current = isOpen;
    const shot = engine.current?.shutter(isOpen);
    if (shot) {
      setSaid(
        `Exposure ${shot.seconds} seconds, ${shot.cars} ${shot.cars === 1 ? "car" : "cars"}.`,
      );
      onExpose?.(shot);
    }
  }, [isOpen, onExpose]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (disabled || next === isOpen) return;
      if (open === undefined) setOwn(next);
      onOpenChange?.(next);
    },
    [disabled, isOpen, open, onOpenChange],
  );
  React.useEffect(() => {
    request.current = setOpen;
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, readoutRef, visible, () =>
      request.current(false),
    );
    engine.current = e;
    e.configure(latest.current);
    // A shutter that starts open opens on mount (and again after a rehearsal remount).
    shown.current = openNow.current;
    if (shown.current) e.shutter(true);
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
      visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  // A press holds the shutter open until the pointer lifts anywhere.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0))
      return;
    const id = event.pointerId;
    setOpen(true);
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      request.current(false);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) setOpen(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) setOpen(!isOpen);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setOpen(false);
    }
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      setOpen(false);
    }
  };

  const d = Math.round(clamp01(dusk) * 100);

  return (
    <div
      ref={bindRoot}
      role="button"
      aria-pressed={isOpen}
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerDown={onPointerDown}
      onContextMenu={(event) => event.preventDefault()}
      onBlur={() => setOpen(false)}
      className={cn(
        "group/switchback-trails relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none [-webkit-touch-callout:none]",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ backgroundColor: SCENE[5] }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${BOX_W} ${BOX_H}`}
        preserveAspectRatio="xMidYMax slice"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-500 group-data-live/switchback-trails:opacity-0"
      >
        <defs>
          <linearGradient id={`${uid}-sky`} x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0"
              style={{
                stopColor: `color-mix(in oklab, ${SCENE[0]}, ${SCENE[1]} ${d}%)`,
              }}
            />
            <stop
              offset="0.42"
              style={{
                stopColor: `color-mix(in oklab, ${SCENE[2]}, ${SCENE[3]} ${d}%)`,
              }}
            />
          </linearGradient>
        </defs>
        <rect width={BOX_W} height={BOX_H} fill={`url(#${uid}-sky)`} />
        <path d={FACE_PATH} style={{ fill: SCENE[5] }} />
        <path
          d={ROAD_PATH}
          fill="none"
          strokeWidth="4"
          strokeLinejoin="round"
          style={{ stroke: SCENE[6], opacity: 0.6 }}
        />
        <path
          d={TRAIL_WHITE}
          fill="none"
          strokeWidth="1.2"
          strokeLinejoin="round"
          style={{ stroke: lightColors[0], opacity: 0.75 }}
        />
        <path
          d={TRAIL_RED}
          fill="none"
          strokeWidth="1.2"
          strokeLinejoin="round"
          style={{ stroke: lightColors[1], opacity: 0.8 }}
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/switchback-trails:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {carried.map((c, i) => (
          <span key={i} style={{ color: c }} />
        ))}
      </span>
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden text-ink transition-colors duration-1"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-[oklch(0.14_0.02_260/0.55)] py-1 pr-2.5 pl-1.5 font-mono text-[10px] tracking-[0.08em] text-[oklch(0.95_0.02_80)] uppercase tabular-nums backdrop-blur-sm"
      >
        <Iris open={isOpen} motionSafe={motionSafe} />
        <span ref={readoutRef} className="inline-block min-w-[6.5em]">
          hold
        </span>
      </div>
      <p id={hintId} className="sr-only">
        A long exposure of a mountain road at dusk. Press and hold, or hold
        Space, to keep the shutter open while the cars draw trails of light; let
        go to develop the photograph. Enter opens and closes the shutter without
        holding; Escape closes it.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
