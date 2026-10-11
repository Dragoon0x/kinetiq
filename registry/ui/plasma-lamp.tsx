"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlasmaLampProps = {
  /** How many filaments wander from the core, 3 to 18. @default 9 */
  tendrils?: number;
  /** The plasma's hue in degrees: 270 is blue violet, 300 violet, 330 magenta. @default 300 */
  hue?: number;
  /** How much the plasma crackles and stutters, 0 (smooth and steady) to 1. @default 0.5 */
  flicker?: number;
  /** How many tendrils swing over to join the arc at your finger, 1 to 6 (a press adds two). @default 3 */
  gather?: number;
  /** How far the tendrils roam when left alone, 0 to 1. @default 0.6 */
  wander?: number;
  /** How fast they roam, 0 to 2. @default 1 */
  speed?: number;
  /** How often a tendril forks near the glass, 0 to 1. @default 0.5 */
  branches?: number;
  /** How much the plasma glows around its filaments, 0 to 1. @default 0.6 */
  glow?: number;
  /** Stand the globe on its pedestal. @default true */
  base?: boolean;
  /** The pointer and touch reach the glass. @default true */
  interactive?: boolean;
  /** Hold the plasma still. @default false */
  paused?: boolean;
  /** Seeds where each tendril wanders. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The lamp's accessible name. @default "Plasma lamp" */
  label?: string;
  /** Play the lamp's hum while the glass is touched. Off unless asked for. @default false */
  sound?: boolean;
  /** The glass was touched or let go, by pointer, touch or key. */
  onTouchChange?: (touching: boolean) => void;
  /** Nothing reaches the glass and the button is disabled. @default false */
  disabled?: boolean;
  /** Sizes the lamp; the globe fits the box. @default "size-56" */
  className?: string;
};

const POINTS = 22;
const BRANCH_POINTS = 7;
const MAX_TENDRILS = 18;
const FLARE = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(seed: number, i: number, k: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ Math.imul(k + 7, 2246822519), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [0, 1), seeded per channel. */
function noise(x: number, channel: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(channel, i, 0);
  const b = hash(channel, i + 1, 0);
  return a + (b - a) * s;
}

const wrapAngle = (a: number) => {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};

/** The lamp's layout inside a box: globe centre and radius, pedestal below. */
function layout(w: number, h: number, withBase: boolean) {
  const R = withBase ? Math.min(w / 2.3, h / 2.54) : Math.min(w / 2.3, h / 2.2);
  const total = withBase ? 2.42 * R : 2 * R;
  const cy = (h - total) / 2 + R;
  return { cx: w / 2, cy, R };
}

/** Plasma tones for a hue: white-hot filament, its glow, the haze, and the glass. */
const tones = (hue: number) => {
  const h = r2(hue);
  return {
    core: `oklch(0.97 0.035 ${h})`,
    mid: `oklch(0.78 0.17 ${h})`,
    halo: `oklch(0.6 0.22 ${h})`,
    glassIn: `oklch(0.22 0.07 ${h})`,
    glassOut: `oklch(0.12 0.035 ${h})`,
    rim: `oklch(0.74 0.06 ${h})`,
  };
};

type Rgb = [number, number, number];

function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [180, 120, 255];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const rgba = (c: Rgb, a: number) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${r2(clamp(a, 0, 1))})`;

type Tendril = {
  base: number;
  spin: number;
  angle: number;
  reach: number;
  depth: number;
  capture: number;
  vel: number;
  target: number;
  bright: number;
  ex: number;
  ey: number;
  pts: Float32Array;
  forks: Float32Array;
  forkOn: Float32Array;
};

type Config = {
  tendrils: number;
  hue: number;
  flicker: number;
  gather: number;
  wander: number;
  speed: number;
  branches: number;
  glow: number;
  base: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Touch = { on: boolean; press: boolean; angle: number; radius: number };

type Engine = {
  configure: (cfg: Config) => void;
  colours: (base: string, lip: string) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  touch: (t: Touch) => void;
  marker: (on: boolean, angle: number, radius: number) => void;
  geometry: () => { cx: number; cy: number; R: number };
  level: () => number;
  dispose: () => void;
};

function createLamp(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  button: HTMLButtonElement,
  onLevel: { current: (level: number) => void },
): Engine {
  const ctx = canvas.getContext("2d");
  const read = colourReader();
  let cfg: Config | null = null;
  const size = { w: 0, h: 0, dpr: 1 };
  let geo = { cx: 0, cy: 0, R: 1 };
  const tendrils: Tendril[] = [];
  let glass: HTMLCanvasElement | null = null;
  let shine: HTMLCanvasElement | null = null;
  let sprite: HTMLCanvasElement | null = null;
  let tone = {
    core: [250, 240, 255] as Rgb,
    mid: [200, 140, 255] as Rgb,
    halo: [150, 70, 230] as Rgb,
  };
  // The same tones as ready-made strokes, rebuilt only when the hue changes.
  const ink = {
    core: "rgb(250, 240, 255)",
    mid: "rgb(200, 140, 255)",
    halo: "rgb(150, 70, 230)",
  };
  let baseCol = "rgb(40, 42, 48)";
  let lipCol = "rgb(90, 92, 100)";
  let built = "";

  let raf = 0;
  let timer = 0;
  let last = 0;
  let t = 0;
  let visible = false;
  let disposed = false;
  let flare = 0;
  let arc = 0;
  const touch: Touch = { on: false, press: false, angle: 0, radius: 0.7 };
  const mark = { on: false, angle: 0, radius: 0.7 };

  const build = () => {
    if (!cfg) return;
    const n = clamp(Math.round(cfg.tendrils), 3, MAX_TENDRILS);
    while (tendrils.length > n) tendrils.pop();
    for (let i = tendrils.length; i < n; i += 1) {
      tendrils.push({
        base: (i / n) * Math.PI * 2 + (hash(cfg.seed, i, 1) - 0.5) * 0.6,
        spin: hash(cfg.seed, i, 2) < 0.5 ? -1 : 1,
        angle: 0,
        reach: 1,
        depth: 0,
        capture: 0,
        vel: 0,
        target: 0,
        bright: 1,
        ex: 0,
        ey: 0,
        pts: new Float32Array((POINTS + 1) * 2),
        forks: new Float32Array(2 * (BRANCH_POINTS + 1) * 2),
        forkOn: new Float32Array(2),
      });
    }
    // Even spacing round the core whenever the count changes.
    tendrils.forEach((td, i) => {
      td.base =
        (i / n) * Math.PI * 2 + (hash(cfg?.seed ?? 5, i, 1) - 0.5) * 0.6;
    });
  };

  /** The static art, drawn once per size and hue: glass and pedestal under, reflections over. */
  const paintStatic = () => {
    if (!cfg) return;
    const key = `${size.w}|${size.h}|${size.dpr}|${cfg.hue}|${cfg.base}|${baseCol}|${lipCol}`;
    if (key === built && glass && shine && sprite) return;
    built = key;
    const t2 = tones(cfg.hue);
    tone = { core: read(t2.core), mid: read(t2.mid), halo: read(t2.halo) };
    ink.core = rgba(tone.core, 1);
    ink.mid = rgba(tone.mid, 1);
    ink.halo = rgba(tone.halo, 1);
    const gIn = read(t2.glassIn);
    const gOut = read(t2.glassOut);
    const rim = read(t2.rim);
    const d = size.dpr;
    const { cx, cy, R } = geo;

    const g = glass ?? document.createElement("canvas");
    g.width = Math.max(1, Math.round(size.w * d));
    g.height = Math.max(1, Math.round(size.h * d));
    const gc = g.getContext("2d");
    if (gc) {
      gc.setTransform(d, 0, 0, d, 0, 0);
      gc.clearRect(0, 0, size.w, size.h);
      if (cfg.base) {
        // A soft shadow on the table, then the pedestal and its collar.
        const sh = gc.createRadialGradient(
          cx,
          cy + R * 1.44,
          0,
          cx,
          cy + R * 1.44,
          R * 0.9,
        );
        sh.addColorStop(0, "rgba(0, 0, 0, 0.22)");
        sh.addColorStop(1, "rgba(0, 0, 0, 0)");
        gc.fillStyle = sh;
        gc.save();
        gc.translate(cx, cy + R * 1.44);
        gc.scale(1, 0.16);
        gc.translate(-cx, -(cy + R * 1.44));
        gc.beginPath();
        gc.arc(cx, cy + R * 1.44, R * 0.9, 0, Math.PI * 2);
        gc.fill();
        gc.restore();
        const top = cy + R * 0.86;
        const bottom = cy + R * 1.42;
        gc.beginPath();
        gc.moveTo(cx - R * 0.42, top);
        gc.lineTo(cx + R * 0.42, top);
        gc.lineTo(cx + R * 0.7, bottom - R * 0.06);
        gc.quadraticCurveTo(cx + R * 0.72, bottom, cx + R * 0.64, bottom);
        gc.lineTo(cx - R * 0.64, bottom);
        gc.quadraticCurveTo(
          cx - R * 0.72,
          bottom,
          cx - R * 0.7,
          bottom - R * 0.06,
        );
        gc.closePath();
        const ped = gc.createLinearGradient(cx - R * 0.7, 0, cx + R * 0.7, 0);
        ped.addColorStop(0, baseCol);
        ped.addColorStop(0.32, lipCol);
        ped.addColorStop(0.6, baseCol);
        ped.addColorStop(1, baseCol);
        gc.fillStyle = ped;
        gc.fill();
        gc.fillStyle = lipCol;
        gc.globalAlpha = 0.55;
        gc.fillRect(cx - R * 0.66, bottom - R * 0.1, R * 1.32, R * 0.025);
        gc.globalAlpha = 1;
      }
      // The glass: deep inside, darker toward its edge.
      const body = gc.createRadialGradient(
        cx,
        cy - R * 0.08,
        R * 0.05,
        cx,
        cy,
        R,
      );
      body.addColorStop(0, `rgb(${gIn[0]}, ${gIn[1]}, ${gIn[2]})`);
      body.addColorStop(1, `rgb(${gOut[0]}, ${gOut[1]}, ${gOut[2]})`);
      gc.fillStyle = body;
      gc.beginPath();
      gc.arc(cx, cy, R, 0, Math.PI * 2);
      gc.fill();
      if (cfg.base) {
        gc.fillStyle = lipCol;
        gc.beginPath();
        gc.ellipse(cx, cy + R * 0.9, R * 0.34, R * 0.07, 0, 0, Math.PI * 2);
        gc.fill();
      }
    }
    glass = g;

    const s = shine ?? document.createElement("canvas");
    s.width = g.width;
    s.height = g.height;
    const sc = s.getContext("2d");
    if (sc) {
      sc.setTransform(d, 0, 0, d, 0, 0);
      sc.clearRect(0, 0, size.w, size.h);
      // The rim, a window reflected top left, and a speck of hot highlight.
      sc.strokeStyle = rgba(rim, 0.38);
      sc.lineWidth = Math.max(1, R * 0.012);
      sc.beginPath();
      sc.arc(cx, cy, R - sc.lineWidth / 2, 0, Math.PI * 2);
      sc.stroke();
      sc.strokeStyle = "rgba(255, 255, 255, 0.22)";
      sc.lineWidth = R * 0.05;
      sc.lineCap = "round";
      sc.beginPath();
      sc.arc(cx, cy, R * 0.86, Math.PI * 1.08, Math.PI * 1.38);
      sc.stroke();
      sc.strokeStyle = "rgba(255, 255, 255, 0.1)";
      sc.lineWidth = R * 0.02;
      sc.beginPath();
      sc.arc(cx, cy, R * 0.86, Math.PI * 1.43, Math.PI * 1.5);
      sc.stroke();
      const spot = sc.createRadialGradient(
        cx - R * 0.42,
        cy - R * 0.5,
        0,
        cx - R * 0.42,
        cy - R * 0.5,
        R * 0.12,
      );
      spot.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      spot.addColorStop(1, "rgba(255, 255, 255, 0)");
      sc.fillStyle = spot;
      sc.fillRect(cx - R * 0.6, cy - R * 0.7, R * 0.4, R * 0.4);
      const edge = sc.createRadialGradient(cx, cy, R * 0.78, cx, cy, R);
      edge.addColorStop(0, rgba(tone.halo, 0));
      edge.addColorStop(1, rgba(tone.halo, 0.16));
      sc.fillStyle = edge;
      sc.beginPath();
      sc.arc(cx, cy, R, 0, Math.PI * 2);
      sc.fill();
    }
    shine = s;

    const sp = sprite ?? document.createElement("canvas");
    sp.width = 64;
    sp.height = 64;
    const spc = sp.getContext("2d");
    if (spc) {
      spc.clearRect(0, 0, 64, 64);
      const gr = spc.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(tone.core, 1));
      gr.addColorStop(0.18, rgba(tone.mid, 0.7));
      gr.addColorStop(0.5, rgba(tone.halo, 0.22));
      gr.addColorStop(1, rgba(tone.halo, 0));
      spc.fillStyle = gr;
      spc.fillRect(0, 0, 64, 64);
    }
    sprite = sp;
  };

  const resize = () => {
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    geo = layout(w, h, cfg?.base ?? true);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    // The hit area follows the glass exactly.
    const pad = 2;
    button.style.left = `${r2(geo.cx - geo.R - pad)}px`;
    button.style.top = `${r2(geo.cy - geo.R - pad)}px`;
    button.style.width = `${r2((geo.R + pad) * 2)}px`;
    button.style.height = `${r2((geo.R + pad) * 2)}px`;
    built = "";
    paintStatic();
    step(0);
    draw();
  };

  /** Advances wander, capture springs and every filament's shape. */
  const step = (dt: number) => {
    if (!cfg) return;
    const motion = cfg.motionSafe;
    const sp = clamp(cfg.speed, 0, 2);
    t += dt * sp;
    const { R } = geo;
    const inner = R * 0.94;
    const wander = clamp(cfg.wander, 0, 1);
    const flick = clamp(cfg.flicker, 0, 1);
    const seed = cfg.seed;
    const forks = clamp(cfg.branches, 0, 1);
    const n = tendrils.length;
    // Who answers the touch: the tendrils nearest its angle.
    const want = touch.on
      ? Math.min(n, Math.round(clamp(cfg.gather, 1, 6)) + (touch.press ? 2 : 0))
      : 0;
    for (const td of tendrils) td.target = 0;
    if (want > 0) {
      // Pick the nearest `want` by angle, without sorting or allocating.
      for (let k = 0; k < want; k += 1) {
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < n; i += 1) {
          const td = tendrils[i];
          if (!td || td.target === 1) continue;
          const dd = Math.abs(wrapAngle(td.angle - touch.angle));
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }
        const td = tendrils[best];
        if (td) td.target = 1;
      }
    }

    arc = 0;
    tendrils.forEach((td, i) => {
      // Wander: each endpoint drifts round the glass on slow noise and slowly
      // dips toward or away from you.
      const roam = (noise(t * 0.16 + i * 7.3, seed * 31 + i) - 0.5) * 2;
      td.angle = wrapAngle(td.base + roam * wander * 1.3 + td.spin * t * 0.05);
      const dip = Math.sin(
        (noise(t * 0.12 + i * 3.1, seed * 37 + i) - 0.5) * 4.4,
      );
      td.depth = dip;
      td.reach = Math.sqrt(1 - dip * dip * 0.72);
      // Capture rides the house springs: snap to gather, drift to let go.
      if (motion && dt > 0) {
        const sprg = td.target > td.capture ? springs.snap : springs.drift;
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let s = 0; s < steps; s += 1) {
          const acc =
            (sprg.stiffness * (td.target - td.capture) -
              sprg.damping * td.vel) /
            sprg.mass;
          td.vel += acc * h;
          td.capture += td.vel * h;
        }
      } else if (!motion) {
        td.capture = td.target;
        td.vel = 0;
      }
      const c = clamp(td.capture, 0, 1.15);
      arc += clamp(td.capture, 0, 1);
      // The endpoint: its own wander, pulled to the finger by the capture.
      const ownA = td.angle;
      const ownR = inner * td.reach;
      const ta = touch.on ? touch.angle : ownA;
      const tr = touch.on ? clamp(touch.radius, 0.2, 1) * inner : ownR;
      const a = ownA + wrapAngle(ta - ownA) * c;
      const r = ownR + (tr - ownR) * clamp(c, 0, 1);
      td.ex = geo.cx + Math.cos(a) * r;
      td.ey = geo.cy + Math.sin(a) * r;
      const flickRate = motion ? 6 + 10 * flick : 0;
      td.bright = motion
        ? 0.72 +
          0.28 * noise(t * flickRate + i * 11.7, seed * 41 + i) -
          (flick > 0.6 && noise(t * 9 + i * 5.3, seed * 43 + i) > 1.6 - flick
            ? 0.35
            : 0)
        : 0.9;
      // The filament: core to endpoint, bowed and crackling, converging onto
      // one shared path as it is captured so the gathered ones fuse.
      const sx = geo.cx + Math.cos(a) * R * 0.11;
      const sy = geo.cy + Math.sin(a) * R * 0.11;
      const dx = td.ex - sx;
      const dy = td.ey - sy;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const crackle = motion ? flick : 0.25;
      for (let k = 0; k <= POINTS; k += 1) {
        const u = k / POINTS;
        const env = Math.pow(Math.sin(Math.PI * u), 0.8) * (0.45 + 0.55 * u);
        const own =
          (noise(u * 2.4 + t * 0.7 + i * 13.1, seed * 53 + i) - 0.5) * R * 0.2 +
          (noise(u * 9 + t * 7 + i * 3.7, seed * 59 + i) - 0.5) *
            R *
            0.06 *
            crackle +
          (noise(u * 21 + t * 15 + i * 1.9, seed * 61 + i) - 0.5) *
            R *
            0.025 *
            crackle;
        const shared =
          (noise(u * 2 + t * 0.9, seed * 67) - 0.5) * R * 0.1 +
          (noise(u * 10 + t * 8, seed * 71) - 0.5) * R * 0.04 * crackle +
          (noise(u * 6 + t * 3 + i * 2.1, seed * 73 + i) - 0.5) * R * 0.018;
        const off = (own + (shared - own) * clamp(c, 0, 1)) * env;
        td.pts[k * 2] = sx + dx * u + nx * off;
        td.pts[k * 2 + 1] = sy + dy * u + ny * off;
      }
      // Forks near the glass, flickering on and off; a captured filament keeps none.
      for (let f = 0; f < 2; f += 1) {
        const u0 = 0.55 + 0.3 * hash(seed, i * 2 + f, 9);
        const k0 = Math.round(u0 * POINTS);
        const bx = td.pts[k0 * 2] ?? sx;
        const by = td.pts[k0 * 2 + 1] ?? sy;
        const side = f === 0 ? 1 : -1;
        const turn = side * (0.45 + 0.3 * hash(seed, i * 2 + f, 10));
        const ca = Math.cos(turn);
        const sa = Math.sin(turn);
        const ux = dx / len;
        const uy = dy / len;
        const fx = ux * ca - uy * sa;
        const fy = ux * sa + uy * ca;
        const flen = R * (0.12 + 0.14 * hash(seed, i * 2 + f, 11));
        const on = motion
          ? noise(t * 2.6 + i * 4.1 + f * 17, seed * 79 + i) > 1 - forks * 0.85
          : hash(seed, i * 2 + f, 12) < forks * 0.6;
        td.forkOn[f] = on ? 1 - clamp(c, 0, 1) : 0;
        for (let k = 0; k <= BRANCH_POINTS; k += 1) {
          const u = k / BRANCH_POINTS;
          const jitter =
            (noise(u * 7 + t * 9 + f * 3 + i, seed * 83 + i) - 0.5) *
            R *
            0.05 *
            (0.4 + crackle) *
            u;
          const at = (f * (BRANCH_POINTS + 1) + k) * 2;
          td.forks[at] = bx + fx * flen * u - fy * jitter;
          td.forks[at + 1] = by + fy * flen * u + fx * jitter;
        }
      }
    });
    if (flare > 0) flare *= Math.exp(-dt / (FLARE / 2.3));
    if (flare < 0.01) flare = 0;
  };

  const stroke = (
    c: CanvasRenderingContext2D,
    pts: Float32Array,
    from: number,
    count: number,
  ) => {
    c.beginPath();
    c.moveTo(pts[from * 2] ?? 0, pts[from * 2 + 1] ?? 0);
    for (let k = 1; k < count; k += 1) {
      c.lineTo(pts[(from + k) * 2] ?? 0, pts[(from + k) * 2 + 1] ?? 0);
    }
  };

  const drawTendril = (c: CanvasRenderingContext2D, td: Tendril, s: number) => {
    const cap = clamp(td.capture, 0, 1);
    const b = td.bright * (td.depth < -0.35 ? 0.55 : 1) * (1 + 0.5 * cap);
    const glow = clamp(cfg?.glow ?? 0.6, 0, 1);
    const widen = 1 + 0.9 * cap;
    // Three passes, wide haze to white-hot core; colours are fixed strings
    // and only the alpha changes, so a frame builds no strings.
    for (let pass = 0; pass < 3; pass += 1) {
      const width =
        pass === 0
          ? 7 * s * widen
          : pass === 1
            ? 2.6 * s * widen
            : 1.1 * s * (1 + 0.4 * cap);
      const alpha = pass === 0 ? 0.05 + 0.08 * glow : pass === 1 ? 0.3 : 0.85;
      c.strokeStyle = pass === 0 ? ink.halo : pass === 1 ? ink.mid : ink.core;
      c.globalAlpha = clamp(alpha * b, 0, 1);
      c.lineWidth = width;
      stroke(c, td.pts, 0, POINTS + 1);
      c.stroke();
      for (let f = 0; f < 2; f += 1) {
        const on = td.forkOn[f] ?? 0;
        if (on <= 0.02) continue;
        c.globalAlpha = clamp(alpha * b * on * 0.8, 0, 1);
        c.lineWidth = width * 0.6;
        stroke(c, td.forks, f * (BRANCH_POINTS + 1), BRANCH_POINTS + 1);
        c.stroke();
      }
    }
    // Where it meets the glass, a soft foot of light.
    if (sprite) {
      const foot = (14 + 10 * cap) * s;
      c.globalAlpha = clamp(0.45 * b, 0, 1);
      c.drawImage(sprite, td.ex - foot / 2, td.ey - foot / 2, foot, foot);
    }
    c.globalAlpha = 1;
  };

  const draw = () => {
    if (!ctx || !cfg || size.w <= 0) return;
    paintStatic();
    const d = size.dpr;
    const { cx, cy, R } = geo;
    const s = R / 85;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (glass) ctx.drawImage(glass, 0, 0);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const lit = arc / Math.max(1, clamp(cfg.gather, 1, 6));
    // The haze round the core, brighter while current flows to a finger.
    if (sprite) {
      const haze = R * (1.1 + 0.25 * lit);
      ctx.globalAlpha = clamp(
        0.32 * (0.6 + 0.4 * clamp(cfg.glow, 0, 1)) + 0.15 * lit,
        0,
        1,
      );
      ctx.drawImage(sprite, cx - haze, cy - haze, haze * 2, haze * 2);
      ctx.globalAlpha = 1;
    }
    for (const td of tendrils) if (td.depth < -0.35) drawTendril(ctx, td, s);
    if (sprite) {
      const core = R * (0.3 + 0.06 * lit);
      ctx.globalAlpha = 1;
      ctx.drawImage(sprite, cx - core, cy - core, core * 2, core * 2);
      const hot = R * 0.11;
      ctx.drawImage(sprite, cx - hot, cy - hot, hot * 2, hot * 2);
    }
    for (const td of tendrils) if (td.depth >= -0.35) drawTendril(ctx, td, s);
    if (sprite && (touch.on || flare > 0)) {
      const px =
        cx + Math.cos(touch.angle) * clamp(touch.radius, 0.2, 1) * R * 0.94;
      const py =
        cy + Math.sin(touch.angle) * clamp(touch.radius, 0.2, 1) * R * 0.94;
      const contact = R * (0.22 + 0.5 * flare) * (0.6 + 0.4 * lit);
      ctx.globalAlpha = clamp(0.35 * lit + 0.6 * flare, 0, 1);
      ctx.drawImage(
        sprite,
        px - contact,
        py - contact,
        contact * 2,
        contact * 2,
      );
      ctx.globalAlpha = 1;
    }
    if (mark.on && !touch.on) {
      // The keyboard's finger, waiting: a faint ring where it would touch.
      const px = cx + Math.cos(mark.angle) * mark.radius * R * 0.94;
      const py = cy + Math.sin(mark.angle) * mark.radius * R * 0.94;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = ink.core;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(px, py, 6 * s + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shine) ctx.drawImage(shine, 0, 0);
    root.setAttribute("data-live", "");
  };

  const canRun = () =>
    visible &&
    !document.hidden &&
    !disposed &&
    !!cfg &&
    !cfg.paused &&
    cfg.motionSafe;

  const tick = (now: number) => {
    raf = 0;
    if (!canRun()) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    draw();
    onLevel.current(arc);
    // Alone, the plasma is drawn at about 30 fps and the page is left in
    // peace between frames; touched, every frame.
    const idle = !touch.on && arc < 0.02 && flare === 0;
    if (!idle) {
      raf = requestAnimationFrame(tick);
      return;
    }
    timer = window.setTimeout(() => {
      timer = 0;
      if (canRun() && !raf) raf = requestAnimationFrame(tick);
    }, 28);
  };

  const wake = () => {
    if (raf || !canRun()) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  /** One still frame, for reduced motion, a held lamp and any change while stopped. */
  const still = () => {
    if (raf || timer) return;
    step(0);
    draw();
    onLevel.current(arc);
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (!prev || prev.tendrils !== next.tendrils || prev.seed !== next.seed)
        build();
      if (prev && prev.base !== next.base) resize();
      if (prev && prev.dpr !== next.dpr) resize();
      if (!canRun()) halt();
      still();
      wake();
    },
    colours: (b, l) => {
      baseCol = b;
      lipCol = l;
      built = "";
      still();
    },
    resize,
    setVisible: (on) => {
      visible = on;
      if (on) {
        still();
        wake();
      } else halt();
    },
    touch: (next) => {
      const starting = next.on && !touch.on;
      touch.on = next.on;
      touch.press = next.press;
      touch.angle = next.angle;
      touch.radius = next.radius;
      if (starting && cfg?.motionSafe) flare = 1;
      if (!cfg?.motionSafe || cfg.paused) {
        still();
        return;
      }
      wake();
    },
    marker: (on, angle, radius) => {
      mark.on = on;
      mark.angle = angle;
      mark.radius = radius;
      still();
    },
    geometry: () => geo,
    level: () => arc,
    dispose: () => {
      disposed = true;
      halt();
    },
  };
}

/** The server's frame and reduced motion's look-alike: glass, core, five still filaments, pedestal. */
function standIn(seed: number, hue: number, count: number) {
  const { cx, cy, R } = layout(100, 100, true);
  const n = Math.min(5, Math.max(3, count));
  const paths = Array.from({ length: n }, (_, i) => {
    const a =
      (i / n) * Math.PI * 2 + (hash(seed, i, 1) - 0.5) * 0.6 - Math.PI / 2;
    const reach = R * (0.82 + 0.12 * hash(seed, i, 3));
    const sx = cx + Math.cos(a) * R * 0.11;
    const sy = cy + Math.sin(a) * R * 0.11;
    const ex = cx + Math.cos(a) * reach;
    const ey = cy + Math.sin(a) * reach;
    const dx = ex - sx;
    const dy = ey - sy;
    const len = Math.hypot(dx, dy) || 1;
    const pts: string[] = [];
    for (let k = 0; k <= 12; k += 1) {
      const u = k / 12;
      const env = Math.pow(Math.sin(Math.PI * u), 0.8) * (0.45 + 0.55 * u);
      const off =
        ((noise(u * 2.4 + i * 13.1, seed * 53 + i) - 0.5) * R * 0.2 +
          (noise(u * 9 + i * 3.7, seed * 59 + i) - 0.5) * R * 0.03) *
        env;
      pts.push(
        `${r2(sx + dx * u - (dy / len) * off)},${r2(sy + dy * u + (dx / len) * off)}`,
      );
    }
    return { i, d: `M ${pts.join(" L ")}`, ex: r2(ex), ey: r2(ey) };
  });
  const t = tones(hue);
  return { cx: r2(cx), cy: r2(cy), R: r2(R), paths, t };
}

/**
 * A desk plasma lamp: a dark glass globe on a pedestal, a hot core, and
 * filaments of plasma wandering out to the inside of the glass — each a
 * jagged path of 22 points, a slow meander plus a fast crackle set by
 * `flicker`, forking near the glass, its endpoint drifting round the sphere
 * and dipping toward or away from you. Put the pointer on the glass (hover,
 * or press with a finger) and the tendrils nearest that angle swing over on
 * springs.snap and converge onto one shared path, fusing into a single
 * bright braided arc to your finger with a flare where it lands; a press
 * gathers two more. Leave and they drift back into their wander on
 * springs.drift. The globe is a round button: Enter or Space touches the
 * glass, arrows move the finger round it, Escape lets go. Canvas 2D, ~30 fps
 * alone and full rate while touched, stopped off screen. Under reduced
 * motion it holds one still frame and a touch redraws with the arc formed.
 */
export function PlasmaLamp({
  tendrils = 9,
  hue = 300,
  flicker = 0.5,
  gather = 3,
  wander = 0.6,
  speed = 1,
  branches = 0.5,
  glow = 0.6,
  base = true,
  interactive = true,
  paused = false,
  seed = 5,
  dpr = 2,
  label = "Plasma lamp",
  sound = false,
  onTouchChange,
  disabled = false,
  className,
}: PlasmaLampProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const hum = React.useRef<LoopHandle | null>(null);
  const [touching, setTouching] = React.useState(false);
  const state = React.useRef({
    pointer: false,
    press: false,
    key: false,
    angle: -Math.PI / 4,
    radius: 0.8,
    reported: false,
  });

  const live = interactive && !disabled;
  const cfg: Config = {
    tendrils,
    hue,
    flicker,
    gather,
    wander,
    speed,
    branches,
    glow,
    base,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const cfgRef = React.useRef(cfg);
  const reportRef = React.useRef(onTouchChange);
  const levelRef = React.useRef<(level: number) => void>(() => {});
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    reportRef.current = onTouchChange;
    levelRef.current = (level) => {
      const loop = hum.current;
      if (!loop) return;
      loop.set({
        gain: clamp(0.12 + (level / Math.max(1, gather)) * 0.45, 0, 0.6),
        pitch:
          1 + 0.04 * flicker + 0.08 * clamp(level / Math.max(1, gather), 0, 1),
      });
    };
  });

  const readColours = React.useCallback(() => {
    const host = carriersRef.current;
    if (!host) return;
    const [b, l] = Array.from(host.children);
    engine.current?.colours(
      b ? getComputedStyle(b).color : "rgb(40, 42, 48)",
      l ? getComputedStyle(l).color : "rgb(90, 92, 100)",
    );
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    if (!root || !canvas || !button) return;
    const e = createLamp(root, canvas, button, levelRef);
    engine.current = e;
    e.configure(cfgRef.current);
    readColours();
    e.resize();
    e.setVisible(visible.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      hum.current?.stop();
      hum.current = null;
    };
  }, [readColours]);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  // Sound switched off mid-touch: the hum goes with it.
  React.useEffect(() => {
    if (sound) return;
    hum.current?.stop();
    hum.current = null;
  }, [sound]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visible.current);
    });
    watcher.observe(node);
    const onVisibility = () => {
      engine.current?.setVisible(visible.current && !document.hidden);
      if (document.hidden) {
        hum.current?.stop();
        hum.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      visible.current = false;
    };
  }, []);

  /** Pushes the current touch to the lamp, the hum and the host. */
  const sync = (fromActivation: boolean) => {
    const s = state.current;
    const on = s.pointer || s.key;
    engine.current?.touch({
      on,
      press: s.press,
      angle: s.angle,
      radius: s.radius,
    });
    if (on && !hum.current && sound) {
      // The hum answers the visitor: a press or a key, or a hover once the
      // page has had one.
      const activated =
        fromActivation ||
        (
          navigator as Navigator & {
            userActivation?: { hasBeenActive: boolean };
          }
        ).userActivation?.hasBeenActive === true;
      if (activated) {
        hum.current = audio.start("hum", { gain: 0.12, pitch: 1 });
      }
    } else if (!on && hum.current) {
      hum.current.stop();
      hum.current = null;
    }
    if (on !== s.reported) {
      s.reported = on;
      setTouching(on);
      reportRef.current?.(on);
    }
  };

  /** A client point as the angle and radius on the glass. */
  const onGlass = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const g = engine.current?.geometry();
    if (!root || !g) return null;
    const r = root.getBoundingClientRect();
    const x = clientX - r.left - g.cx;
    const y = clientY - r.top - g.cy;
    const d = Math.hypot(x, y);
    return {
      angle: Math.atan2(y, x),
      radius: clamp(d / (g.R * 0.94), 0.15, 1),
      inside: d <= g.R + 3,
    };
  };

  const release = (event: React.PointerEvent) => {
    const s = state.current;
    s.press = false;
    // A mouse still over the glass keeps a light touch; a lifted finger lets go.
    const at = onGlass(event.clientX, event.clientY);
    s.pointer = event.pointerType !== "touch" && Boolean(at?.inside);
    sync(false);
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !live,
    onMove: (info) => {
      const at = onGlass(info.point.x, info.point.y);
      if (!at) return;
      const s = state.current;
      s.angle = at.angle;
      s.radius = at.radius;
      sync(true);
    },
    onEnd: (info) => release(info.event as React.PointerEvent),
    onCancel: () => {
      const s = state.current;
      s.press = false;
      s.pointer = false;
      sync(false);
    },
    onTap: (event) => release(event),
  });

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.onPointerDown(event);
    if (!live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = onGlass(event.clientX, event.clientY);
    if (!at) return;
    const s = state.current;
    s.pointer = true;
    s.press = true;
    s.key = false;
    s.angle = at.angle;
    s.radius = at.radius;
    sync(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    drag.onPointerMove(event);
    if (!live || event.pointerType === "touch") return;
    const at = onGlass(event.clientX, event.clientY);
    if (!at) return;
    const s = state.current;
    s.pointer = at.inside;
    s.angle = at.angle;
    s.radius = at.radius;
    sync(false);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    const s = state.current;
    if (s.press) return;
    s.pointer = false;
    sync(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const s = state.current;
    const turn = event.shiftKey ? Math.PI / 4 : Math.PI / 12;
    let handled = true;
    if (event.key === "ArrowRight") s.angle = wrapAngle(s.angle + turn);
    else if (event.key === "ArrowLeft") s.angle = wrapAngle(s.angle - turn);
    else if (event.key === "ArrowUp")
      s.radius = clamp(s.radius + 0.15, 0.25, 1);
    else if (event.key === "ArrowDown")
      s.radius = clamp(s.radius - 0.15, 0.25, 1);
    else if (event.key === "Escape") {
      if (!s.key) return;
      s.key = false;
    } else handled = false;
    if (!handled) return;
    event.preventDefault();
    engine.current?.marker(true, s.angle, s.radius);
    sync(true);
  };

  const t = tones(hue);
  const still = standIn(seed, hue, tendrils);

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/plasma-lamp relative isolate size-56 overflow-clip",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/plasma-lamp:opacity-0"
      >
        <defs>
          <radialGradient id={`${uid}-glass`} cx="50%" cy="46%" r="52%">
            <stop offset="0%" style={{ stopColor: t.glassIn }} />
            <stop offset="100%" style={{ stopColor: t.glassOut }} />
          </radialGradient>
          <radialGradient id={`${uid}-core`}>
            <stop offset="0%" style={{ stopColor: t.core }} />
            <stop offset="22%" style={{ stopColor: t.mid }} stopOpacity={0.7} />
            <stop offset="100%" style={{ stopColor: t.halo }} stopOpacity={0} />
          </radialGradient>
        </defs>
        {base ? (
          <path
            d={`M ${r2(still.cx - still.R * 0.42)} ${r2(still.cy + still.R * 0.86)} L ${r2(still.cx + still.R * 0.42)} ${r2(still.cy + still.R * 0.86)} L ${r2(still.cx + still.R * 0.7)} ${r2(still.cy + still.R * 1.42)} L ${r2(still.cx - still.R * 0.7)} ${r2(still.cy + still.R * 1.42)} Z`}
            style={{ fill: "oklch(from var(--ink) 0.24 0.012 h)" }}
          />
        ) : null}
        <circle
          cx={still.cx}
          cy={still.cy}
          r={still.R}
          fill={`url(#${uid}-glass)`}
        />
        <circle
          cx={still.cx}
          cy={still.cy}
          r={r2(still.R * 0.34)}
          fill={`url(#${uid}-core)`}
        />
        {still.paths.map((p) => (
          <g key={p.i} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path
              d={p.d}
              style={{ stroke: t.halo }}
              strokeOpacity={0.3}
              strokeWidth={2.4}
            />
            <path
              d={p.d}
              style={{ stroke: t.core }}
              strokeOpacity={0.85}
              strokeWidth={0.55}
            />
            <circle cx={p.ex} cy={p.ey} r={2.2} fill={`url(#${uid}-core)`} />
          </g>
        ))}
        <circle
          cx={still.cx}
          cy={still.cy}
          r={r2(still.R - 0.3)}
          fill="none"
          style={{ stroke: t.rim }}
          strokeOpacity={0.38}
          strokeWidth={0.5}
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span
          className="transition-colors duration-1"
          style={{ color: "oklch(from var(--ink) 0.24 0.012 h)" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "oklch(from var(--ink) 0.42 0.012 h)" }}
        />
      </span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-pressed={touching}
        aria-describedby={live ? hintId : undefined}
        disabled={!live}
        {...drag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          const s = state.current;
          engine.current?.marker(true, s.angle, s.radius);
        }}
        onBlur={() => {
          engine.current?.marker(false, 0, 0);
          const s = state.current;
          if (s.key) {
            s.key = false;
            sync(false);
          }
        }}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it touches the glass, or lets it go.
          if (event.detail !== 0 || !live) return;
          const s = state.current;
          s.key = !s.key;
          engine.current?.marker(true, s.angle, s.radius);
          sync(true);
        }}
        className={cn(
          "absolute top-[3%] left-[10.7%] size-[78.7%] cursor-pointer touch-none rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      />
      {live ? (
        <p id={hintId} className="sr-only">
          Enter or Space touches the glass; Left and Right move your finger
          round it, Up and Down move it in and out; Escape lets go.
        </p>
      ) : null}
    </div>
  );
}
