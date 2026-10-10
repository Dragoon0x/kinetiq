"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  bindScreen,
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createGridMesh,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type Mesh,
  type Program,
} from "@/registry/lib/glsl";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ClothGridPattern = "check" | "ticking" | "towel" | "plain";
export type ClothGridPin = "sheet" | "banner" | "corners";

export type ClothGridProps = {
  /** An image the cloth carries. It must be readable across origins (CORS); the woven print is used without it or when it fails to load. */
  src?: string;
  /** The woven print drawn when there is no image. @default "towel" */
  pattern?: ClothGridPattern;
  /** The print's ground, thread and accent colours, as CSS colours. @default linen ground, accent-hue thread, madder stripe (pigments that read the same in both themes) */
  colors?: readonly [string, string, string];
  /** Words woven into the print. They are part of the accessible name too. */
  caption?: string;
  /** The accessible name of the cloth. @default "Fabric" */
  label?: string;
  /** Silk to canvas, 0 to 1: how many folds form, how far the weave stretches and how firmly it returns. @default 0.55 */
  stiffness?: number;
  /** Cells across the cloth's long side, 8 to 48: coarse cloth folds in facets, fine cloth in curves. @default 28 */
  resolution?: number;
  /** How the cloth is held: lying flat, hanging from a rod, or pinned at its two top corners. @default "sheet" */
  pin?: ClothGridPin;
  /** How far a pinch raises the fabric toward you, 0 to 1. @default 0.5 */
  lift?: number;
  /** How much fabric a pinch takes, 0 (a single point) to 1 (a handful). @default 0.35 */
  grip?: number;
  /** How many soft ripples the cloth leaves as it returns, 0 to 1. @default 0.5 */
  ripple?: number;
  /** The cloth's weight when it hangs (banner and corners), 0 to 1. @default 0.5 */
  gravity?: number;
  /** How much a passing pointer pushes the cloth, 0 to 1. @default 0.5 */
  wind?: number;
  /** The highlight along ridges, 0 (cotton) to 1 (silk). @default 0.35 */
  sheen?: number;
  /** Lifted cloth casts a soft shadow. @default true */
  shadow?: boolean;
  /** The highest device pixel ratio drawn, capped at 2. @default 2 */
  dpr?: number;
  /** Freeze the cloth where it is. @default false */
  paused?: boolean;
  /** The pointer and the keyboard move the cloth; false leaves it still and out of the tab order. @default true */
  interactive?: boolean;
  /** Fires when the cloth is taken hold of (true) and let go (false), by pointer or keys. */
  onGrabChange?: (grabbing: boolean) => void;
  /** Size the box here. @default "aspect-[2/1] w-full" */
  className?: string;
};

/** Fixed simulation step, s. */
const STEP = 1 / 120;
/** Frames of stillness before the loop sleeps. */
const QUIET_FRAMES = 40;
/** The pigments: the same linen, indigo and madder in both themes. */
const DEFAULT_COLORS = [
  "oklch(from var(--warn) 0.95 0.018 h)",
  "oklch(from var(--accent-bright) 0.42 0.12 h)",
  "oklch(from var(--danger) 0.6 0.15 h)",
] as const;
const SHADE = "color-mix(in oklab, var(--ink) 30%, black)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

/** Any CSS colour to 0–1 rgb, through a 1×1 canvas: oklch, color-mix and all. */
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
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/*
 * Where the cloth rests in its box, per pin mode. The same numbers are the
 * print canvas's CSS insets below, so the static print (server render, no
 * WebGL, a lost context) sits exactly where the live cloth lies.
 */
function restRect(pin: ClothGridPin, w: number, h: number) {
  if (pin === "banner") return { x0: 14, y0: 18, cw: w - 28, ch: h - 40 };
  if (pin === "corners") {
    return { x0: 26, y0: 16, cw: w - 52, ch: h - 16 - h * 0.18 };
  }
  return { x0: 14, y0: 14, cw: w - 28, ch: h - 28 };
}
const PRINT_BOX: Record<ClothGridPin, React.CSSProperties> = {
  sheet: {
    left: 14,
    top: 14,
    width: "calc(100% - 28px)",
    height: "calc(100% - 28px)",
  },
  banner: {
    left: 14,
    top: 18,
    width: "calc(100% - 28px)",
    height: "calc(100% - 40px)",
  },
  corners: {
    left: 26,
    top: 16,
    width: "calc(100% - 52px)",
    height: "calc(82% - 16px)",
  },
};
/**
 * The corner pins sit a little in from the cloth's own corners, so it drapes:
 * 4.5% of its width, but never so much that the sag of a short, wide box
 * would carry the hem out of it.
 */
function cornerPins(w: number, h: number): [number, number, number] {
  const { x0, y0, cw } = restRect("corners", w, h);
  const inset = Math.min(cw * 0.045, h * 0.1);
  return [x0 + inset, x0 + cw - inset, y0];
}

type Cloth = {
  pin: ClothGridPin;
  x0: number;
  y0: number;
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  n: number;
  ax: number;
  ay: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  oz: Float32Array;
  rx: Float32Array;
  ry: Float32Array;
  lap: Float32Array;
  /** Inverse mass: 0 for pins and a fully held pinch, else 1. */
  im: Float32Array;
  fixed: Uint8Array;
  ca: Int32Array;
  cb: Int32Array;
  cl: Float32Array;
  /** 0 structural, 1 shear, 2 bend. */
  ck: Uint8Array;
  m: number;
  gidx: Int32Array;
  gw: Float32Array;
  gox: Float32Array;
  goy: Float32Array;
  gcount: number;
  /** Positions packed for the GPU, RGBA32F. */
  tex: Float32Array;
  /** Seconds since the cloth was hung: the corner pins draw in over the first half second. */
  age: number;
  /** Corner pin x positions and their y. */
  pins: [number, number, number];
};

function buildCloth(
  pin: ClothGridPin,
  w: number,
  h: number,
  resolution: number,
): Cloth {
  const { x0, y0, cw, ch } = restRect(pin, w, h);
  const res = clamp(Math.round(resolution), 8, 48);
  const cols =
    cw >= ch ? res : clamp(Math.round((res * cw) / Math.max(ch, 1)), 3, 48);
  const rows =
    cw >= ch ? clamp(Math.round((res * ch) / Math.max(cw, 1)), 3, 48) : res;
  const vx = cols + 1;
  const n = vx * (rows + 1);
  const ax = cw / cols;
  const ay = ch / rows;
  const f = () => new Float32Array(n);
  const c: Cloth = {
    pin,
    x0,
    y0,
    cw,
    ch,
    cols,
    rows,
    n,
    ax,
    ay,
    x: f(),
    y: f(),
    z: f(),
    ox: f(),
    oy: f(),
    oz: f(),
    rx: f(),
    ry: f(),
    lap: f(),
    im: f(),
    fixed: new Uint8Array(n),
    ca: new Int32Array(0),
    cb: new Int32Array(0),
    cl: new Float32Array(0),
    ck: new Uint8Array(0),
    m: 0,
    gidx: new Int32Array(n),
    gw: f(),
    gox: f(),
    goy: f(),
    gcount: 0,
    tex: new Float32Array(n * 4),
    age: 0,
    pins: cornerPins(w, h),
  };
  // A fraction of a pixel of seeded depth noise: perfectly flat cloth under
  // compression would only slide; this lets it buckle into folds.
  const rand = lcg(1390 + cols * 31 + rows);
  for (let r = 0; r <= rows; r += 1) {
    for (let q = 0; q <= cols; q += 1) {
      const k = r * vx + q;
      c.rx[k] = x0 + q * ax;
      c.ry[k] = y0 + r * ay;
      const fixed =
        (pin === "banner" && r === 0) ||
        (pin === "corners" && r === 0 && (q === 0 || q === cols));
      c.fixed[k] = fixed ? 1 : 0;
      c.im[k] = fixed ? 0 : 1;
    }
  }
  resetCloth(c);
  for (let k = 0; k < n; k += 1) {
    const jitter = (rand() - 0.5) * 0.6;
    if (!c.fixed[k]) c.z[k] = jitter;
    c.oz[k] = c.z[k] ?? 0;
  }

  const pairs: number[] = [];
  const add = (a: number, b: number, kind: number) => pairs.push(a, b, kind);
  for (let r = 0; r <= rows; r += 1) {
    for (let q = 0; q <= cols; q += 1) {
      const k = r * vx + q;
      if (q < cols) add(k, k + 1, 0);
      if (r < rows) add(k, k + vx, 0);
      if (q < cols && r < rows) {
        add(k, k + vx + 1, 1);
        add(k + 1, k + vx, 1);
      }
      if (q < cols - 1) add(k, k + 2, 2);
      if (r < rows - 1) add(k, k + 2 * vx, 2);
    }
  }
  const m = pairs.length / 3;
  c.ca = new Int32Array(m);
  c.cb = new Int32Array(m);
  c.cl = new Float32Array(m);
  c.ck = new Uint8Array(m);
  for (let i = 0; i < m; i += 1) {
    const a = pairs[i * 3] ?? 0;
    const b = pairs[i * 3 + 1] ?? 0;
    c.ca[i] = a;
    c.cb[i] = b;
    c.ck[i] = pairs[i * 3 + 2] ?? 0;
    c.cl[i] = Math.hypot(
      (c.rx[b] ?? 0) - (c.rx[a] ?? 0),
      (c.ry[b] ?? 0) - (c.ry[a] ?? 0),
    );
  }
  c.m = m;
  return c;
}

/** Where a pinned particle is held: its rest, or for corners drawn inward. */
function pinX(c: Cloth, k: number) {
  const x = c.rx[k] ?? 0;
  if (c.pin !== "corners") return x;
  const inward = x < c.x0 + c.cw / 2 ? c.pins[0] : c.pins[1];
  const t = clamp01(c.age / 0.5);
  return lerp(x, inward, t * t * (3 - 2 * t));
}

/** Lay the cloth back at rest. */
function resetCloth(c: Cloth) {
  for (let k = 0; k < c.n; k += 1) {
    const x = c.rx[k] ?? 0;
    const y = c.ry[k] ?? 0;
    c.x[k] = x;
    c.y[k] = y;
    c.z[k] = 0;
    c.ox[k] = x;
    c.oy[k] = y;
    c.oz[k] = 0;
  }
}

type Params = {
  stiffness: number;
  ripple: number;
  gravity: number;
  wind: number;
  lift: number;
  grip: number;
};

type Sim = {
  cloth: Cloth | null;
  w: number;
  h: number;
  p: Params;
  grab: {
    on: boolean;
    keyboard: boolean;
    sx: number;
    sy: number;
    hx: number;
    hy: number;
    rise: number;
    riseV: number;
  };
  /** The keyboard's handle: a target and a point that glides after it. */
  key: { tx: number; ty: number; x: number; y: number; vx: number; vy: number };
  hover: { x: number; y: number; t: number; on: boolean };
  acc: number;
  quiet: number;
  motion: number;
  maxZ: number;
};

const newSim = (): Sim => ({
  cloth: null,
  w: 0,
  h: 0,
  p: {
    stiffness: 0.55,
    ripple: 0.5,
    gravity: 0.5,
    wind: 0.5,
    lift: 0.5,
    grip: 0.35,
  },
  grab: {
    on: false,
    keyboard: false,
    sx: 0,
    sy: 0,
    hx: 0,
    hy: 0,
    rise: 0,
    riseV: 0,
  },
  key: { tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0 },
  hover: { x: 0, y: 0, t: 0, on: false },
  acc: 0,
  quiet: 0,
  motion: 0,
  maxZ: 0,
});

/**
 * One fixed step: Verlet integration with a membrane term for ripples, the
 * pinch, then the constraints. `settle` swaps in heavy damping so a pose can be
 * solved without motion (reduced motion).
 */
function step(s: Sim, c: Cloth, settle = false) {
  const p = s.p;
  const sheet = c.pin === "sheet";
  const k01 = clamp01(p.stiffness);
  const g = s.grab;
  // Every particle of a lying sheet has its own spring back to rest; its
  // damping ratio runs from the drift spring's ζ 1 down to 0.22 by `ripple`.
  const anchorK = lerp(70, 240, k01) * (g.on ? 0.6 : 1);
  const anchorC = 2 * lerp(1, 0.22, clamp01(p.ripple)) * Math.sqrt(anchorK);
  // Height returns more softly than position, so a dropped tent rings out.
  const anchorKz = anchorK * 0.55;
  const anchorCz = 2 * lerp(0.9, 0.16, clamp01(p.ripple)) * Math.sqrt(anchorKz);
  const keep = settle ? 0.55 : 1 - lerp(0.02, 0.004, clamp01(p.ripple));
  const gravity = sheet ? 0 : clamp01(p.gravity) * 1400;
  const a = (c.ax + c.ay) / 2;
  // Out-of-plane tension, so a pluck or a release runs as a ripple. Capped
  // so the explicit step stays stable on fine cloth.
  const tension = Math.min(420 * 420, (0.4 * a * a) / (STEP * STEP));
  const inv = 1 / (a * a);
  const vx = c.cols + 1;
  const { x, y, z, ox, oy, oz, rx, ry, lap, im, fixed } = c;

  for (let r = 0; r <= c.rows; r += 1) {
    for (let q = 0; q <= c.cols; q += 1) {
      const k = r * vx + q;
      const zk = z[k] ?? 0;
      const l = q > 0 ? (z[k - 1] ?? 0) : zk;
      const rr = q < c.cols ? (z[k + 1] ?? 0) : zk;
      const u = r > 0 ? (z[k - vx] ?? 0) : zk;
      const d = r < c.rows ? (z[k + vx] ?? 0) : zk;
      lap[k] = (l + rr + u + d - 4 * zk) * inv;
    }
  }

  const dt = STEP;
  const dt2 = dt * dt;
  for (let k = 0; k < c.n; k += 1) {
    if (fixed[k]) continue;
    const xk = x[k] ?? 0;
    const yk = y[k] ?? 0;
    const zk = z[k] ?? 0;
    const vxk = (xk - (ox[k] ?? 0)) * keep;
    const vyk = (yk - (oy[k] ?? 0)) * keep;
    const vzk = (zk - (oz[k] ?? 0)) * keep;
    let accX = 0;
    let accY = gravity;
    let accZ = tension * (lap[k] ?? 0);
    if (sheet) {
      accX += -anchorK * (xk - (rx[k] ?? 0)) - (anchorC * vxk) / dt;
      accY += -anchorK * (yk - (ry[k] ?? 0)) - (anchorC * vyk) / dt;
      accZ += -anchorKz * zk - (anchorCz * vzk) / dt;
    }
    ox[k] = xk;
    oy[k] = yk;
    oz[k] = zk;
    x[k] = xk + vxk + accX * dt2;
    y[k] = yk + vyk + accY * dt2;
    z[k] = zk + vzk + accZ * dt2;
  }

  if (g.on) {
    // The lift rises on the snap constants: the tent comes up with one
    // small overshoot rather than popping in on a single step.
    const kk = springs.snap.stiffness;
    const cc = springs.snap.damping;
    g.riseV += (kk * (1 - g.rise) - cc * g.riseV) * dt;
    g.rise += g.riseV * dt;
    const liftZ = clamp01(p.lift) * 0.4 * Math.min(c.cw, c.ch) * g.rise;
    for (let j = 0; j < c.gcount; j += 1) {
      const k = c.gidx[j] ?? 0;
      const w = c.gw[j] ?? 0;
      const tx = g.hx + (c.gox[j] ?? 0);
      const ty = g.hy + (c.goy[j] ?? 0);
      const tz = liftZ * w;
      const xk = x[k] ?? 0;
      const yk = y[k] ?? 0;
      const zk = z[k] ?? 0;
      x[k] = xk + (tx - xk) * w;
      y[k] = yk + (ty - yk) * w;
      z[k] = zk + (tz - zk) * w;
    }
  }

  if (c.pin === "corners" && c.age < 0.5) {
    c.age += dt;
    for (let k = 0; k < c.n; k += 1) if (fixed[k]) x[k] = pinX(c, k);
  }

  const iterations = settle ? 12 : Math.round(lerp(2, 10, k01));
  // Hanging cloth bends and shears freely, so it drapes instead of acting
  // like a board; a lying sheet keeps more body.
  const shear = lerp(0.5, 1, k01) * (sheet ? 1 : 0.12);
  const bend = lerp(0.04, 0.5, k01) * (sheet ? 1 : 1.1);
  const { ca, cb, cl, ck } = c;
  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < c.m; i += 1) {
      const ia = ca[i] ?? 0;
      const ib = cb[i] ?? 0;
      const wa = im[ia] ?? 0;
      const wb = im[ib] ?? 0;
      const ws = wa + wb;
      if (ws <= 0) continue;
      const dx = (x[ib] ?? 0) - (x[ia] ?? 0);
      const dy = (y[ib] ?? 0) - (y[ia] ?? 0);
      const dz = (z[ib] ?? 0) - (z[ia] ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const kind = ck[i] ?? 0;
      const k = kind === 0 ? 1 : kind === 1 ? shear : bend;
      const diff = (((dist - (cl[i] ?? 0)) / dist) * k) / ws;
      x[ia] = (x[ia] ?? 0) + dx * diff * wa;
      y[ia] = (y[ia] ?? 0) + dy * diff * wa;
      z[ia] = (z[ia] ?? 0) + dz * diff * wa;
      x[ib] = (x[ib] ?? 0) - dx * diff * wb;
      y[ib] = (y[ib] ?? 0) - dy * diff * wb;
      z[ib] = (z[ib] ?? 0) - dz * diff * wb;
    }
  }

  // The fabric lies on its table: it can rise toward you, never sink behind.
  let motion = 0;
  let maxZ = 0;
  for (let k = 0; k < c.n; k += 1) {
    if (sheet && (z[k] ?? 0) < -4) z[k] = -4;
    const m =
      Math.abs((x[k] ?? 0) - (ox[k] ?? 0)) +
      Math.abs((y[k] ?? 0) - (oy[k] ?? 0)) +
      Math.abs((z[k] ?? 0) - (oz[k] ?? 0));
    if (m > motion) motion = m;
    if ((z[k] ?? 0) > maxZ) maxZ = z[k] ?? 0;
  }
  s.motion = motion;
  s.maxZ = maxZ;
}

const focal = (s: Sim) => 1.6 * Math.max(s.w, s.h, 1);

/** The particle drawn nearest a point in the box, by its projected position. */
function nearest(s: Sim, c: Cloth, px: number, py: number) {
  const F = focal(s);
  const cx = s.w / 2;
  const cy = s.h / 2;
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < c.n; k += 1) {
    const sc = F / Math.max(F - (c.z[k] ?? 0), 1);
    const sx = cx + ((c.x[k] ?? 0) - cx) * sc;
    const sy = cy + ((c.y[k] ?? 0) - cy) * sc;
    const d = Math.hypot(sx - px, sy - py);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return { k: best, d: bestD };
}

function beginGrab(
  s: Sim,
  c: Cloth,
  px: number,
  py: number,
  keyboard: boolean,
) {
  const hit = nearest(s, c, px, py);
  if (hit.k < 0 || hit.d > Math.max(c.ax, c.ay) * 1.5 + 12) return false;
  const bx = c.x[hit.k] ?? 0;
  const by = c.y[hit.k] ?? 0;
  const reach = clamp01(s.p.grip) * 0.26 * Math.min(c.cw, c.ch) + 0.01;
  let count = 0;
  for (let k = 0; k < c.n; k += 1) {
    if (c.fixed[k]) continue;
    const d = Math.hypot((c.x[k] ?? 0) - bx, (c.y[k] ?? 0) - by);
    let w = 0;
    if (k === hit.k) w = 1;
    else if (d < reach) w = (1 - d / reach) ** 2 * 0.92;
    else continue;
    c.gidx[count] = k;
    c.gw[count] = w;
    c.gox[count] = (c.x[k] ?? 0) - px;
    c.goy[count] = (c.y[k] ?? 0) - py;
    c.im[k] = 1 - w;
    count += 1;
  }
  c.gcount = count;
  s.grab = {
    on: true,
    keyboard,
    sx: px,
    sy: py,
    hx: px,
    hy: py,
    rise: 0,
    riseV: 0,
  };
  return true;
}

function endGrab(s: Sim, c: Cloth | null) {
  s.grab.on = false;
  s.grab.keyboard = false;
  if (!c) return;
  for (let k = 0; k < c.n; k += 1) c.im[k] = c.fixed[k] ? 0 : 1;
  c.gcount = 0;
}

/** The pinch follows the hand 1:1, rubber-banded past ~45% of the short side. */
function pullTo(s: Sim, c: Cloth, px: number, py: number) {
  const dx = px - s.grab.sx;
  const dy = py - s.grab.sy;
  const len = Math.hypot(dx, dy);
  const limit = 0.45 * Math.min(c.cw, c.ch);
  const k = len > limit ? (limit + rubberband(len - limit, limit)) / len : 1;
  s.grab.hx = s.grab.sx + dx * k;
  s.grab.hy = s.grab.sy + dy * k;
}

/** A velocity kick toward the viewer under a point: the ring of a pluck. */
function pluck(c: Cloth, px: number, py: number, strength: number) {
  const reach = 0.22 * Math.min(c.cw, c.ch) + 20;
  for (let k = 0; k < c.n; k += 1) {
    if (c.fixed[k]) continue;
    const d2 = ((c.x[k] ?? 0) - px) ** 2 + ((c.y[k] ?? 0) - py) ** 2;
    if (d2 > reach * reach) continue;
    const f = (1 - d2 / (reach * reach)) ** 2;
    c.oz[k] = (c.oz[k] ?? 0) - f * strength * STEP;
  }
}

/** A passing pointer pushes the cloth into the page, in proportion to its speed. */
function blow(
  c: Cloth,
  px: number,
  py: number,
  vx: number,
  vy: number,
  wind: number,
) {
  const speed = Math.min(Math.hypot(vx, vy), 2400);
  if (speed < 1 || wind <= 0) return;
  // Hanging cloth has nothing behind it, so a breath moves it further.
  const push = c.pin === "sheet" ? 0.1 : 0.3;
  const reach = c.pin === "sheet" ? 70 : 96;
  for (let k = 0; k < c.n; k += 1) {
    if (c.fixed[k]) continue;
    const d2 = ((c.x[k] ?? 0) - px) ** 2 + ((c.y[k] ?? 0) - py) ** 2;
    if (d2 > reach * reach) continue;
    const f = (1 - d2 / (reach * reach)) ** 2 * wind;
    c.oz[k] = (c.oz[k] ?? 0) + f * speed * push * STEP;
    c.ox[k] = (c.ox[k] ?? 0) - f * vx * 0.04 * STEP;
    c.oy[k] = (c.oy[k] ?? 0) - f * vy * 0.04 * STEP;
  }
}

// ---------------------------------------------------------------- the print

type Inks = { ground: string; thread: string; accent: string; shade: string };

function weave(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  thread: string,
  strength: number,
) {
  ctx.fillStyle = thread;
  ctx.globalAlpha = 0.04 * strength;
  for (let y = 0; y < ch; y += 2) ctx.fillRect(0, y, cw, 0.6);
  ctx.globalAlpha = 0.028 * strength;
  for (let x = 0; x < cw; x += 2) ctx.fillRect(x, 0, 0.6, ch);
  // Slubs: the short thick places every hand-spun linen thread has.
  const rand = lcg(14);
  ctx.globalAlpha = 0.07 * strength;
  const slubs = Math.round((cw * ch) / 900);
  for (let i = 0; i < slubs; i += 1) {
    ctx.fillRect(rand() * cw, rand() * ch, 4 + rand() * 18, 0.8);
  }
  ctx.globalAlpha = 1;
}

function caption(
  ctx: CanvasRenderingContext2D,
  text: string,
  cw: number,
  ch: number,
  inks: Inks,
  font: string,
  patch: boolean,
) {
  const words = text.toUpperCase();
  let size = clamp(Math.min(ch * 0.085, cw * 0.05), 8, 24);
  ctx.font = `600 ${size}px ${font}`;
  const track = () => size * 0.22;
  const measure = () => {
    let total = 0;
    for (const ch2 of words) total += ctx.measureText(ch2).width + track();
    return total - track();
  };
  let width = measure();
  if (width > cw * 0.84) {
    size = Math.max(6, (size * cw * 0.84) / width);
    ctx.font = `600 ${size}px ${font}`;
    width = measure();
  }
  const cx = cw / 2;
  const cy = ch / 2;
  if (patch) {
    // A sewn label: a ground patch, a hairline edge and a running stitch.
    const pw = width + size * 2;
    const ph = size * 2.4;
    ctx.fillStyle = inks.ground;
    ctx.beginPath();
    ctx.rect(cx - pw / 2, cy - ph / 2, pw, ph);
    ctx.fill();
    ctx.strokeStyle = inks.thread;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([2.5, 2.5]);
    ctx.strokeRect(cx - pw / 2 + 3, cy - ph / 2 + 3, pw - 6, ph - 6);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = inks.thread;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let x = cx - width / 2;
  for (const letter of words) {
    ctx.fillText(letter, x, cy);
    x += ctx.measureText(letter).width + track();
  }
}

function paintPrint(
  canvas: HTMLCanvasElement,
  cw: number,
  ch: number,
  dpr: number,
  inks: Inks,
  pattern: ClothGridPattern,
  text: string | undefined,
  font: string,
  image: HTMLImageElement | null,
) {
  if (cw < 1 || ch < 1) return;
  const scale = Math.min(dpr, 2048 / Math.max(cw, ch));
  const W = Math.max(1, Math.round(cw * scale));
  const H = Math.max(1, Math.round(ch * scale));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = inks.ground;
  ctx.fillRect(0, 0, cw, ch);

  if (image) {
    const k = Math.max(cw / image.naturalWidth, ch / image.naturalHeight);
    const iw = image.naturalWidth * k;
    const ih = image.naturalHeight * k;
    ctx.drawImage(image, (cw - iw) / 2, (ch - ih) / 2, iw, ih);
    weave(ctx, cw, ch, inks.thread, 0.6);
  } else {
    if (pattern === "check") {
      const s = Math.max(5, Math.round(Math.min(cw, ch) / 11));
      ctx.fillStyle = inks.thread;
      ctx.globalAlpha = 0.36;
      for (let x = 0; x < cw; x += 2 * s) ctx.fillRect(x, 0, s, ch);
      for (let y = 0; y < ch; y += 2 * s) ctx.fillRect(0, y, cw, s);
      ctx.globalAlpha = 1;
    } else if (pattern === "ticking") {
      const P = Math.max(16, cw / 14);
      for (let x = P * 0.25; x < cw; x += P) {
        ctx.fillStyle = inks.thread;
        ctx.fillRect(x, 0, 1.6, ch);
        ctx.fillRect(x + 4, 0, 1.6, ch);
        ctx.fillStyle = inks.accent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x + P / 2 - 1.5, 0, 3, ch);
        ctx.globalAlpha = 1;
      }
    } else if (pattern === "towel") {
      // Woven borders top and bottom: a broad thread band, then two fine
      // lines, one of them madder, mirrored.
      const u = Math.min(ch, cw * 0.6);
      const bands: [number, number, string][] = [
        [0.09, 0.05, inks.thread],
        [0.162, 0.016, inks.accent],
        [0.194, 0.016, inks.thread],
      ];
      for (const [at, t, colour] of bands) {
        ctx.fillStyle = colour;
        ctx.fillRect(0, u * at, cw, u * t);
        ctx.fillRect(0, ch - u * at - u * t, cw, u * t);
      }
    }
    weave(ctx, cw, ch, inks.thread, 1);
  }
  if (text) {
    const patch =
      image !== null || (pattern !== "towel" && pattern !== "plain");
    caption(ctx, text, cw, ch, inks, font, patch);
  }
}

// ---------------------------------------------------------------- WebGL

const CLOTH_VERTEX = /* glsl */ `precision highp float;
precision highp sampler2D;
in vec2 a_uv;
in vec2 a_cell;
uniform sampler2D u_pos;
uniform vec2 u_grid;
uniform vec2 u_res;
uniform float u_focal;
uniform vec2 u_spacing;
uniform float u_shadow;
uniform vec2 u_cast;
uniform float u_hang;
out vec2 v_uv;
out vec3 v_normal;
out float v_crease;
out float v_height;

vec3 at(ivec2 c) {
  return texelFetch(u_pos, clamp(c, ivec2(0), ivec2(u_grid)), 0).xyz;
}

void main() {
  ivec2 hi = ivec2(u_grid);
  ivec2 c = ivec2(a_cell + 0.5);
  vec3 p = at(c);
  ivec2 l = max(c - ivec2(1, 0), ivec2(0));
  ivec2 r = min(c + ivec2(1, 0), hi);
  ivec2 u = max(c - ivec2(0, 1), ivec2(0));
  ivec2 d = min(c + ivec2(0, 1), hi);
  vec3 dx = at(r) - at(l);
  vec3 dy = at(d) - at(u);
  // x right, y down, z toward the viewer: flat cloth faces +z.
  v_normal = normalize(cross(dx, dy) + vec3(0.0, 0.0, 1e-6));
  float spanX = float(r.x - l.x) * u_spacing.x;
  float spanY = float(d.y - u.y) * u_spacing.y;
  float stretch = 0.5 * (length(dx) / max(spanX, 0.001) + length(dy) / max(spanY, 0.001));
  v_crease = clamp((1.0 - stretch) * 2.2, 0.0, 1.0);
  v_uv = a_uv;
  vec2 xy = p.xy;
  float z = p.z;
  v_height = z;
  if (u_shadow > 0.5) {
    float height = max(z, 0.0) + u_hang;
    xy += u_cast * height;
    v_height = height;
    z = 0.0;
  }
  vec2 centre = u_res * 0.5;
  float s = u_focal / max(u_focal - z, 1.0);
  vec2 screen = centre + (xy - centre) * s;
  gl_Position = vec4(
    screen.x / u_res.x * 2.0 - 1.0,
    1.0 - screen.y / u_res.y * 2.0,
    clamp(-z / 4000.0, -1.0, 1.0),
    1.0
  );
}`;

const CLOTH_FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec3 u_ground;
uniform float u_sheen;
uniform float u_shadow;
in vec2 v_uv;
in vec3 v_normal;
in float v_crease;
in float v_height;
out vec4 o_color;

void main() {
  if (u_shadow > 0.5) {
    float a = clamp(v_height / 36.0, 0.0, 1.0);
    o_color = vec4(a, 0.0, 0.0, a);
    return;
  }
  vec3 n = normalize(v_normal);
  vec3 base = texture(u_tex, v_uv).rgb;
  if (!gl_FrontFacing) {
    // The reverse of a print: the same design, faded into the ground.
    n = -n;
    base = mix(base, u_ground, 0.6) * 0.92;
  }
  // Lit from the upper left, normalised so flat cloth shows the print exactly.
  vec3 L = normalize(vec3(-0.45, -0.6, 1.0));
  float lit = max(dot(n, L), 0.0) / L.z;
  // Folds turned from the light darken, but never to black: cloth scatters.
  float light = max(mix(1.0, lit, 0.75), 0.4) * (1.0 - v_crease * 0.3);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = max(pow(max(dot(n, H), 0.0), 16.0) - pow(H.z, 16.0), 0.0);
  float rim = pow(1.0 - clamp(abs(n.z), 0.0, 1.0), 3.0);
  vec3 color = base * light + vec3(u_sheen * (spec * 0.4 + rim * 0.1));
  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform sampler2D u_map;
uniform vec2 u_texel;
uniform vec3 u_shade;
uniform float u_strength;
in vec2 v_uv;
out vec4 o_color;

float tap(vec2 uv, vec2 o) {
  return texture(u_map, uv + o * u_texel).r;
}

void main() {
  // The map was drawn with GL's y up; the screen pass reads it DOM-up.
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  float a = tap(uv, vec2(0.0)) * 0.2;
  a += (tap(uv, vec2(1.5, 0.0)) + tap(uv, vec2(-1.5, 0.0)) + tap(uv, vec2(0.0, 1.5)) + tap(uv, vec2(0.0, -1.5))) * 0.12;
  a += (tap(uv, vec2(1.2, 1.2)) + tap(uv, vec2(-1.2, 1.2)) + tap(uv, vec2(1.2, -1.2)) + tap(uv, vec2(-1.2, -1.2))) * 0.08;
  a *= u_strength;
  o_color = vec4(u_shade * a, a);
}`;

type Gfx = {
  gl: GLContext;
  canvas: HTMLCanvasElement;
  cloth: Program;
  blur: Program;
  tri: FullscreenTriangle;
  mesh: Mesh | null;
  meshKey: string;
  pos: WebGLTexture | null;
  print: WebGLTexture | null;
  printVersion: number;
  fbo: Framebuffer | null;
  ground: Rgb;
  shade: Rgb;
};

function createGfx(canvas: HTMLCanvasElement): Gfx | null {
  const gl = createGL(canvas, {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
  if (!gl) return null;
  const cloth = createProgram(gl, CLOTH_VERTEX, CLOTH_FRAGMENT);
  const blur = createProgram(gl, FULLSCREEN_VERTEX, SHADOW_FRAGMENT);
  if (!cloth || !blur) {
    cloth?.dispose();
    blur?.dispose();
    return null;
  }
  try {
    return {
      gl,
      canvas,
      cloth,
      blur,
      tri: createFullscreenTriangle(gl, blur),
      mesh: null,
      meshKey: "",
      pos: null,
      print: null,
      printVersion: -1,
      fbo: null,
      ground: [0.95, 0.93, 0.9],
      shade: [0, 0, 0],
    };
  } catch {
    cloth.dispose();
    blur.dispose();
    return null;
  }
}

function disposeGfx(g: Gfx) {
  const { gl } = g;
  g.mesh?.dispose();
  g.tri.dispose();
  g.cloth.dispose();
  g.blur.dispose();
  g.fbo?.dispose();
  if (g.pos) gl.deleteTexture(g.pos);
  if (g.print) gl.deleteTexture(g.print);
  g.mesh = null;
  g.fbo = null;
  g.pos = null;
  g.print = null;
}

function renderCloth(
  g: Gfx,
  s: Sim,
  c: Cloth,
  print: HTMLCanvasElement,
  printVersion: number,
  opts: { dpr: number; sheen: number; shadow: boolean },
): boolean {
  const { gl, canvas } = g;
  if (gl.isContextLost()) return false;
  const vx = c.cols + 1;
  const vy = c.rows + 1;

  const key = `${c.cols}x${c.rows}`;
  if (g.meshKey !== key || !g.mesh || !g.pos) {
    g.mesh?.dispose();
    if (g.pos) gl.deleteTexture(g.pos);
    g.mesh = createGridMesh(gl, g.cloth, c.cols, c.rows);
    g.pos = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g.pos);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      vx,
      vy,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    g.meshKey = key;
  }
  if (g.printVersion !== printVersion || !g.print) {
    if (print.width < 2) return false;
    g.print = uploadTexture(gl, print, { linear: true }, g.print);
    // Mipmaps, so a check pattern bunched into a fold never shimmers.
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    g.printVersion = printVersion;
  }
  if (!g.mesh || !g.pos || !g.print) return false;

  const size = resizeGL(gl, canvas, { dprCap: opts.dpr });
  const fw = Math.max(1, Math.ceil(size.width / 4));
  const fh = Math.max(1, Math.ceil(size.height / 4));
  if (!g.fbo || g.fbo.width !== fw || g.fbo.height !== fh) {
    g.fbo?.dispose();
    g.fbo = createFramebuffer(gl, fw, fh);
  }

  const t = c.tex;
  for (let k = 0; k < c.n; k += 1) {
    t[k * 4] = c.x[k] ?? 0;
    t[k * 4 + 1] = c.y[k] ?? 0;
    t[k * 4 + 2] = c.z[k] ?? 0;
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, g.pos);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, vx, vy, gl.RGBA, gl.FLOAT, t);

  const hang = c.pin === "sheet" ? 0 : 5;
  const shadowOn = opts.shadow && (hang > 0 || s.maxZ > 0.5);
  const common = {
    u_grid: [c.cols, c.rows],
    u_res: [s.w, s.h],
    u_focal: focal(s),
    u_spacing: [c.ax, c.ay],
    u_cast: [0.3, 0.55],
    u_hang: hang,
    u_ground: g.ground,
    u_sheen: clamp01(opts.sheen),
  };
  g.cloth.use();
  g.cloth.texture("u_pos", g.pos, 0);
  g.cloth.texture("u_tex", g.print, 1);
  g.cloth.set(common);

  gl.disable(gl.DEPTH_TEST);
  if (shadowOn) {
    // The shadow is cast at quarter resolution; MAX keeps overlapping folds
    // from stacking into a darker blot.
    g.fbo.bind();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    g.cloth.set({ u_shadow: 1 });
    g.mesh.draw();
    gl.blendEquation(gl.FUNC_ADD);
  }
  bindScreen(gl);
  gl.clearColor(0, 0, 0, 0);
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  if (shadowOn) {
    g.blur.use();
    g.blur.texture("u_map", g.fbo.texture, 2);
    g.blur.set({
      u_texel: [1 / fw, 1 / fh],
      u_shade: g.shade,
      u_strength: hang > 0 ? 0.3 : 0.36,
    });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    g.tri.draw();
  }
  gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  g.cloth.use();
  g.cloth.set({ u_shadow: 0 });
  g.mesh.draw();
  gl.disable(gl.DEPTH_TEST);
  return true;
}

/**
 * A rectangle of printed fabric that is a real Verlet cloth. Press anywhere
 * and pull: the fabric under the fingers follows 1:1 and rises toward you on
 * the snap spring, so it tents up with radial folds and bunches ahead of the
 * pull, lit from its own normals with a soft cast shadow. Let go and the
 * release velocity carries on while every particle springs back to rest, the
 * return running out in a few soft ripples. Hung from a rod (`pin="banner"`)
 * it sways from a passing pointer; pinned at two corners it falls into a
 * drape. The cloth is a WebGL2 grid mesh whose positions go up as a float
 * texture each frame; without WebGL2 the flat print is the still frame.
 *
 * The surface is a `role="application"`: focus shows a handle, Arrow keys take
 * hold and pull it, Enter or Space lets go (or plucks the cloth), Escape lets
 * go. Under reduced motion a pull still poses the cloth under the hand, but
 * nothing ripples or swings and a release lays it flat at once.
 */
export function ClothGrid({
  src,
  pattern = "towel",
  colors = DEFAULT_COLORS,
  caption: words,
  label = "Fabric",
  stiffness = 0.55,
  resolution = 28,
  pin = "sheet",
  lift = 0.5,
  grip = 0.35,
  ripple = 0.5,
  gravity = 0.5,
  wind = 0.5,
  sheen = 0.35,
  shadow = true,
  dpr = 2,
  paused = false,
  interactive = true,
  onGrabChange,
  className,
}: ClothGridProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const printRef = React.useRef<HTMLCanvasElement | null>(null);
  const simRef = React.useRef<Sim | null>(null);
  const gfxRef = React.useRef<Gfx | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const inksRef = React.useRef<Inks | null>(null);
  const printVersion = React.useRef(0);
  const loop = React.useRef({ raf: 0, last: 0, seen: false, draw: 0 });
  const api = React.useRef<{
    resize: () => void;
    wake: () => void;
    sleep: () => void;
    draw: () => void;
    repaint: () => void;
  } | null>(null);
  const [handle, setHandle] = React.useState(false);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const [grabbing, setGrabbing] = React.useState(false);
  const handleX = useMotionValue(0);
  const handleY = useMotionValue(0);

  const getSim = () => {
    if (!simRef.current) simRef.current = newSim();
    return simRef.current;
  };
  const cap = Math.min(2, Math.max(0.5, dpr));
  const live = motionSafe && !paused;

  /** Show the flat print (no WebGL, a lost context) or hide it under the live cloth. */
  const showPrint = (visible: boolean) => {
    const node = printRef.current;
    if (node) node.style.opacity = visible ? "1" : "0";
  };

  const draw = () => {
    const s = getSim();
    const c = s.cloth;
    const g = gfxRef.current;
    const print = printRef.current;
    if (!c || !print) return;
    if (!g || printVersion.current === 0) {
      showPrint(true);
      return;
    }
    const ok = renderCloth(g, s, c, print, printVersion.current, {
      dpr: cap,
      sheen,
      shadow,
    });
    showPrint(!ok);
    const k = s.key;
    handleX.set(r2(k.x - 12));
    handleY.set(r2(k.y - 12));
  };

  const readInks = () => {
    const node = printRef.current;
    if (!node) return;
    const cs = getComputedStyle(node);
    inksRef.current = {
      ground: cs.color,
      thread: cs.borderTopColor,
      accent: cs.borderRightColor,
      shade: cs.borderBottomColor,
    };
    const g = gfxRef.current;
    if (g) {
      const read = rgbReader();
      g.ground = read(cs.color);
      g.shade = read(cs.borderBottomColor);
    }
  };

  const repaint = () => {
    const s = getSim();
    const c = s.cloth;
    const node = printRef.current;
    const root = rootRef.current;
    if (!c || !node || !root) return;
    if (!inksRef.current) readInks();
    const inks = inksRef.current;
    if (!inks) return;
    paintPrint(
      node,
      c.cw,
      c.ch,
      cap,
      inks,
      pattern,
      words,
      getComputedStyle(root).fontFamily || "sans-serif",
      imageRef.current,
    );
    printVersion.current += 1;
  };

  /** Reduced motion: solve the pose under the hand without showing the way there. */
  const pose = () => {
    const s = getSim();
    const c = s.cloth;
    if (!c) return;
    for (let i = 0; i < 60; i += 1) step(s, c, true);
    for (let k = 0; k < c.n; k += 1) {
      c.ox[k] = c.x[k] ?? 0;
      c.oy[k] = c.y[k] ?? 0;
      c.oz[k] = c.z[k] ?? 0;
    }
  };

  /** Reduced motion: the resting pose at once — flat, or hung and settled. */
  const rest = () => {
    const s = getSim();
    const c = s.cloth;
    if (!c) return;
    resetCloth(c);
    c.age = 1;
    for (let k = 0; k < c.n; k += 1) {
      if (!c.fixed[k]) continue;
      c.x[k] = pinX(c, k);
      c.ox[k] = c.x[k] ?? 0;
    }
    if (c.pin !== "sheet") for (let i = 0; i < 6; i += 1) pose();
    s.maxZ = 0;
  };

  const frame = (dt: number) => {
    const s = getSim();
    const c = s.cloth;
    if (!c) return false;
    s.acc += dt;
    let steps = 0;
    while (s.acc >= STEP && steps < 6) {
      // The keyboard's handle glides after its target on the glide
      // constants, and a keyboard pinch follows the handle.
      const k = s.key;
      const kk = springs.glide.stiffness;
      const cc = springs.glide.damping;
      k.vx += (kk * (k.tx - k.x) - cc * k.vx) * STEP;
      k.vy += (kk * (k.ty - k.y) - cc * k.vy) * STEP;
      k.x += k.vx * STEP;
      k.y += k.vy * STEP;
      if (s.grab.on && s.grab.keyboard) pullTo(s, c, k.x, k.y);
      step(s, c);
      s.acc -= STEP;
      steps += 1;
    }
    if (steps === 6) s.acc = 0;
    draw();
    const k = s.key;
    const handleMoving =
      Math.abs(k.tx - k.x) + Math.abs(k.ty - k.y) > 0.05 ||
      Math.abs(k.vx) + Math.abs(k.vy) > 0.05;
    const moving = s.motion > 0.012 || handleMoving || s.grab.on;
    s.quiet = moving ? 0 : s.quiet + 1;
    return s.quiet < QUIET_FRAMES;
  };
  const frameRef = React.useRef(frame);

  const sleep = () => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  };

  const wake = () => {
    const l = loop.current;
    if (!live) {
      sleep();
      if (!l.draw) {
        l.draw = window.requestAnimationFrame(() => {
          l.draw = 0;
          api.current?.draw();
        });
      }
      return;
    }
    getSim().quiet = 0;
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : STEP;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (frameRef.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  const build = () => {
    const s = getSim();
    if (s.w < 2 || s.h < 2) return;
    endGrab(s, s.cloth);
    s.cloth = buildCloth(pin, s.w, s.h, resolution);
    const c = s.cloth;
    s.key = {
      tx: c.x0 + c.cw / 2,
      ty: c.y0 + c.ch / 2,
      x: c.x0 + c.cw / 2,
      y: c.y0 + c.ch / 2,
      vx: 0,
      vy: 0,
    };
    if (!motionSafe) rest();
    repaint();
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 2 || h < 2) return;
    const s = getSim();
    if (w !== s.w || h !== s.h || !s.cloth) {
      s.w = w;
      s.h = h;
      build();
      setBox({ w, h });
    }
    draw();
    wake();
  };

  React.useEffect(() => {
    frameRef.current = frame;
    api.current = { resize, wake, sleep, draw, repaint };
  });

  // The physics knobs are read every step; they need no rebuild.
  React.useEffect(() => {
    const s = getSim();
    s.p = { stiffness, ripple, gravity, wind, lift, grip };
    api.current?.wake();
  }, [stiffness, ripple, gravity, wind, lift, grip]);

  // A new grid or a new way of hanging starts the cloth afresh.
  React.useEffect(() => {
    const s = getSim();
    if (s.w < 2) return;
    s.cloth = null;
    api.current?.resize();
  }, [pin, resolution, motionSafe]);

  // A changed feel shows itself: the cloth takes a soft pluck at its centre,
  // so a new stiffness, grid or way of hanging is seen without a hand on it.
  const feel = `${stiffness}|${resolution}|${pin}`;
  const shownFeel = React.useRef(feel);
  React.useEffect(() => {
    if (shownFeel.current === feel) return;
    shownFeel.current = feel;
    const c = simRef.current?.cloth;
    if (!c || !motionSafe || paused) return;
    pluck(c, c.x0 + c.cw / 2, c.y0 + c.ch / 2, 260);
    api.current?.wake();
  }, [feel, motionSafe, paused]);

  // A new print: colours, pattern or words.
  const colorKey = colors.join("|");
  React.useEffect(() => {
    inksRef.current = null;
    api.current?.repaint();
    api.current?.draw();
  }, [colorKey, pattern, words, cap]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.wake();
  }, [sheen, shadow, paused]);

  // The image, when there is one: loaded with CORS so the GPU may read it.
  React.useEffect(() => {
    imageRef.current = null;
    api.current?.repaint();
    api.current?.draw();
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      api.current?.repaint();
      api.current?.draw();
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [src]);

  // WebGL: created once per canvas, rebuilt if the context comes back.
  React.useEffect(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    const setup = () => {
      const g = createGfx(canvas);
      gfxRef.current = g;
      if (g) {
        inksRef.current = null;
        api.current?.repaint();
      }
      api.current?.resize();
      api.current?.draw();
    };
    setup();
    const detach = onContextLoss(
      canvas,
      () => {
        // The flat print stands in until the context comes back.
        gfxRef.current = null;
        if (printRef.current) printRef.current.style.opacity = "1";
        api.current?.sleep();
      },
      setup,
    );
    return () => {
      detach();
      const g = gfxRef.current;
      if (g && !g.gl.isContextLost()) disposeGfx(g);
      gfxRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.sleep();
      else api.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const l = loop.current;
    return () => {
      if (l.raf) window.cancelAnimationFrame(l.raf);
      if (l.draw) window.cancelAnimationFrame(l.draw);
      l.raf = 0;
      l.draw = 0;
    };
  }, []);

  // Size and visibility, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const l = loop.current;
    const sizer = new ResizeObserver(() => api.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      l.seen = Boolean(entry?.isIntersecting);
      if (l.seen) api.current?.wake();
      else api.current?.sleep();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      l.seen = false;
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const report = (on: boolean) => {
    setGrabbing(on);
    onGrabChange?.(on);
  };

  const take = (x: number, y: number, keyboard: boolean) => {
    const s = getSim();
    const c = s.cloth;
    if (!c || paused) return false;
    if (!beginGrab(s, c, x, y, keyboard)) return false;
    report(true);
    return true;
  };

  const letGo = () => {
    const s = getSim();
    if (!s.grab.on) return;
    if (s.grab.keyboard) {
      // The handle goes home with the cloth, to where it took hold.
      s.key.tx = s.grab.sx;
      s.key.ty = s.grab.sy;
      if (!motionSafe) {
        s.key.x = s.key.tx;
        s.key.y = s.key.ty;
      }
    }
    endGrab(s, s.cloth);
    report(false);
    if (!motionSafe) rest();
    wake();
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !interactive,
    onStart: ({ point, offset }) => {
      const at = local(point.x - offset.x, point.y - offset.y);
      if (at) take(at.x, at.y, false);
      wake();
    },
    onMove: ({ point }) => {
      const s = getSim();
      const c = s.cloth;
      const at = local(point.x, point.y);
      if (!c || !at || !s.grab.on || s.grab.keyboard) return;
      pullTo(s, c, at.x, at.y);
      if (!motionSafe) {
        pose();
        draw();
      } else wake();
    },
    onEnd: () => letGo(),
    onCancel: () => letGo(),
    onTap: (event) => {
      const c = getSim().cloth;
      const at = local(event.clientX, event.clientY);
      if (!c || !at || !motionSafe || paused) return;
      pluck(c, at.x, at.y, lerp(300, 200, clamp01(stiffness)));
      wake();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const s = getSim();
    const c = s.cloth;
    if (!c) return;
    const k = s.key;
    const big = event.shiftKey ? 48 : 16;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -big;
        break;
      case "ArrowRight":
        dx = big;
        break;
      case "ArrowUp":
        dy = -big;
        break;
      case "ArrowDown":
        dy = big;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (event.repeat) return;
        if (s.grab.on) letGo();
        else if (motionSafe && !paused) {
          pluck(c, k.x, k.y, lerp(300, 200, clamp01(stiffness)));
          wake();
        }
        return;
      case "Escape":
        if (!s.grab.on) return;
        event.preventDefault();
        letGo();
        return;
      default:
        return;
    }
    event.preventDefault();
    setHandle(true);
    if (!s.grab.on) {
      k.tx = k.x;
      k.ty = k.y;
      k.vx = 0;
      k.vy = 0;
      if (!take(k.x, k.y, true)) return;
    }
    // The handle's target walks within the box; the pull itself rubber-bands.
    k.tx = clamp(k.tx + dx, 0, s.w);
    k.ty = clamp(k.ty + dy, 0, s.h);
    if (!motionSafe) {
      k.x = k.tx;
      k.y = k.ty;
      pullTo(s, c, k.x, k.y);
      pose();
      draw();
      return;
    }
    wake();
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate aspect-[2/1] w-full overflow-clip select-none",
        className,
      )}
    >
      <canvas
        ref={printRef}
        aria-hidden
        onTransitionEnd={() => {
          inksRef.current = null;
          api.current?.repaint();
          api.current?.draw();
        }}
        className="pointer-events-none absolute block transition-colors duration-1"
        style={{
          ...PRINT_BOX[pin],
          background: colors[0],
          color: colors[0],
          borderTopColor: colors[1],
          borderRightColor: colors[2],
          borderBottomColor: SHADE,
        }}
      />
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full"
      />
      {pin === "banner" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-3 right-2 left-2 h-1.5 rounded-full"
          style={{
            background:
              "linear-gradient(180deg, oklch(from var(--warn) 0.7 0.07 h), oklch(from var(--warn) 0.45 0.06 h))",
          }}
        />
      ) : pin === "corners" && box ? (
        <>
          {cornerPins(box.w, box.h)
            .slice(0, 2)
            .map((at) => (
              <span
                key={at}
                aria-hidden
                className="pointer-events-none absolute top-4 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: r2(at),
                  background: "oklch(from var(--danger) 0.55 0.16 h)",
                  boxShadow:
                    "0 1px 2px color-mix(in oklab, var(--ink) 30%, transparent)",
                }}
              />
            ))}
        </>
      ) : null}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 size-6 rounded-full border-2 border-cobalt-bright bg-cobalt-wash"
        style={{ x: handleX, y: handleY }}
        initial={false}
        animate={{ opacity: handle ? 1 : 0, scale: handle ? 1 : 0.5 }}
        transition={
          handle
            ? motionSafe
              ? springs.snap
              : { duration: durations.fast }
            : exitFor(durations.fast)
        }
      />
      <div
        role="application"
        aria-roledescription="cloth"
        aria-label={words ? `${label}: ${words}` : label}
        aria-describedby={hintId}
        aria-disabled={!interactive || undefined}
        tabIndex={interactive ? 0 : -1}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (!interactive || paused || !motionSafe) return;
          if (event.pointerType === "touch" || event.buttons !== 0) return;
          const s = getSim();
          const c = s.cloth;
          const at = local(event.clientX, event.clientY);
          if (!c || !at) return;
          const h = s.hover;
          const t = event.timeStamp;
          if (h.on && t > h.t) {
            const dt = Math.max(0.008, (t - h.t) / 1000);
            blow(
              c,
              at.x,
              at.y,
              (at.x - h.x) / dt,
              (at.y - h.y) / dt,
              clamp01(wind),
            );
            wake();
          }
          h.x = at.x;
          h.y = at.y;
          h.t = t;
          h.on = true;
        }}
        onPointerLeave={() => {
          getSim().hover.on = false;
        }}
        onFocus={(event) => {
          if (!interactive || !event.currentTarget.matches(":focus-visible")) {
            return;
          }
          const s = getSim();
          const c = s.cloth;
          if (c && !s.grab.on) {
            const k = s.key;
            k.x = k.tx = c.x0 + c.cw / 2;
            k.y = k.ty = c.y0 + c.ch / 2;
            k.vx = k.vy = 0;
            handleX.set(r2(k.x - 12));
            handleY.set(r2(k.y - 12));
          }
          setHandle(true);
        }}
        onBlur={() => {
          setHandle(false);
          letGo();
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          interactive && "touch-none",
          interactive && (grabbing ? "cursor-grabbing" : "cursor-grab"),
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Arrow keys take hold of the cloth and pull it, Shift for longer pulls.
        Enter or Space lets go, or plucks the cloth when you are not holding it;
        Escape lets go.
      </p>
    </div>
  );
}
