"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BuoyTag = {
  /** Stable id, reported in the selection. */
  id: string;
  /** The tag's text and accessible name. */
  label: string;
  /** The float's paint, any CSS colour. Defaults to the next pigment of the house set. */
  color?: string;
};

export type BuoyTagsProps = {
  /** The tags on the water. @default defaultBuoyTags */
  tags?: BuoyTag[];
  /** Controlled: the ids of the selected tags. */
  value?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the press or key that dunked a tag, with the new selection. */
  onValueChange?: (ids: string[]) => void;
  /** Several tags may be selected; off, choosing one clears the rest. @default true */
  multiple?: boolean;
  /** How high the swell runs, 0 (flat calm) to 1: how much the tags bob and rock. @default 0.5 */
  bob?: number;
  /** How strongly the hand's current pulls the tags and how much slack their moorings give, 0 to 1. @default 0.5 */
  drift?: number;
  /** How deep the water is, 0 to 1: its colour, the length of the moorings, how far shadows fall and how long the swell runs. @default 0.5 */
  depth?: number;
  /** Draw each tag's mooring line down into the water. @default true */
  moorings?: boolean;
  /** How big a dunk's splash is, 0 to 1: the rings and the waves that rock the neighbours. @default 0.7 */
  splash?: number;
  /** The hand (pointer or keyboard focus) makes a current the tags drift on. @default true */
  interactive?: boolean;
  /** Hold the water and the tags still. @default false */
  paused?: boolean;
  /** Seeds the swell and the moorings. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Play the plips of a dunk. Off unless asked for. @default false */
  sound?: boolean;
  /** The group's accessible name. @default "Tags" */
  label?: string;
  /** Fires when a tag is dunked, with its id. */
  onDunk?: (id: string) => void;
  /** No presses; the water lies still. @default false */
  disabled?: boolean;
  /** Sizes the water. @default "h-56 w-full" */
  className?: string;
};

export const defaultBuoyTags: BuoyTag[] = [
  { id: "harbours", label: "Harbours" },
  { id: "tides", label: "Tides" },
  { id: "kelp", label: "Kelp" },
  { id: "storms", label: "Storms" },
  { id: "reefs", label: "Reefs" },
  { id: "ferries", label: "Ferries" },
  { id: "gulls", label: "Gulls" },
  { id: "salt", label: "Salt marsh" },
];

/* -------------------------------- constants ------------------------------- */

/**
 * Pigments for the floats, at fixed lightness so a red buoy is the same red
 * on a light page and a dark one.
 */
const PIGMENTS = [
  "oklch(from var(--danger) 0.66 0.16 h)",
  "oklch(from var(--warn) 0.8 0.14 h)",
  "oklch(from var(--accent-bright) 0.64 0.15 h)",
  "oklch(from var(--success) 0.7 0.13 h)",
  "oklch(from var(--danger) 0.74 0.11 calc(h + 30))",
  "oklch(from var(--signal) 0.74 0.11 h)",
  "oklch(from var(--warn) 0.72 0.12 calc(h - 35))",
  "oklch(from var(--accent-bright) 0.72 0.11 calc(h + 40))",
];

/** Shallow water, deep water, the light on the crests, the lines and the shadow under a float. */
const SHALLOW =
  "color-mix(in oklab, oklch(0.8 0.07 210) 46%, var(--background))";
const DEEP = "color-mix(in oklab, oklch(0.55 0.09 232) 58%, var(--background))";
const CREST =
  "color-mix(in oklab, oklch(0.98 0.02 200) 72%, var(--background))";
const LINE = "color-mix(in oklab, var(--foreground) 46%, var(--background))";
const SHADE = "oklch(0.24 0.04 240)";
const WATER_TINT = "color-mix(in oklab, oklch(0.62 0.08 225) 55%, transparent)";

/** Water grid cell, px. */
const CELL = 8;
/** Physics step, s. */
const STEP = 1 / 120;
/** Ripple step, s: the wave equation runs at its own fixed rate. */
const RIPPLE_STEP = 1 / 60;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A small seeded generator. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB 0–255, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = d[0] ?? 0;
    out[at + 1] = d[1] ?? 0;
    out[at + 2] = d[2] ?? 0;
  };
}

/** Closest points between segments p1–q1 and p2–q2, as their parameters. */
function closest(
  p1x: number,
  p1y: number,
  q1x: number,
  q1y: number,
  p2x: number,
  p2y: number,
  q2x: number,
  q2y: number,
  out: Float64Array,
) {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let s = 0;
  let t = 0;
  if (a <= 1e-6 && e <= 1e-6) {
    s = 0;
    t = 0;
  } else if (a <= 1e-6) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-6) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const den = a * e - b * b;
      s = den > 1e-6 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  out[0] = p1x + d1x * s;
  out[1] = p1y + d1y * s;
  out[2] = p2x + d2x * t;
  out[3] = p2y + d2y * t;
}

/* ---------------------------------- types --------------------------------- */

type TagHandles = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  lift: MotionValue<number>;
  sink: MotionValue<number>;
  node: HTMLButtonElement | null;
};

type Body = {
  id: string;
  hx: number;
  hy: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  yaw: number;
  spin: number;
  z: number;
  slope: number;
  sway: number;
};

type Config = {
  bob: number;
  drift: number;
  depth: number;
  moorings: boolean;
  splash: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Wave = {
  kx: number;
  ky: number;
  amp: number;
  omega: number;
  phase: number;
};

type Ring = {
  x: number;
  y: number;
  age: number;
  strength: number;
  on: boolean;
};

type Engine = {
  configure: (next: Config) => void;
  measure: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  splashAt: (id: string) => void;
  dispose: () => void;
};

/* --------------------------------- engine -------------------------------- */

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  handles: Map<string, TagHandles>,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  const water = document.createElement("canvas");
  const wctx = water.getContext("2d");
  const shadow = document.createElement("canvas");
  const read = rgbReader();
  /** Shallow, deep, crest, line, shade — RGB 0–255. */
  const colours = new Float32Array(15);
  let lineStyle = "rgb(90, 90, 90)";
  let crestStyle = "rgb(250, 250, 250)";
  const pair = new Float64Array(4);
  let cfg: Config | null = null;
  let bodies: Body[] = [];
  let w = 0;
  let h = 0;
  let cols = 0;
  let rows = 0;
  let prev = new Float32Array(0);
  let cur = new Float32Array(0);
  let image: ImageData | null = null;
  let waves: Wave[] = [];
  let rippleLive = false;
  let rippleAcc = 0;
  let physicsAcc = 0;
  let clock = 0;
  let frame = 0;
  let last = 0;
  let disposed = false;
  const hand = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  const rings: Ring[] = Array.from({ length: 6 }, () => ({
    x: 0,
    y: 0,
    age: 0,
    strength: 0,
    on: false,
  }));

  const lay = () => {
    const c = cfg;
    if (!c) return;
    const rand = lcg(c.seed * 7 + 3);
    const depth = clamp(c.depth, 0, 1);
    const length = 150 + 190 * depth;
    const dirs = [0.25, -0.55, 1.05];
    const scales = [1, 0.61, 0.38];
    const amps = [1, 0.5, 0.26];
    waves = dirs.map((dir, i) => {
      const a = dir + (rand() - 0.5) * 0.5;
      const k = (Math.PI * 2) / (length * (scales[i] ?? 1));
      const speed = 22 + 0.1 * length * (scales[i] ?? 1);
      return {
        kx: Math.cos(a) * k,
        ky: Math.sin(a) * k,
        amp: amps[i] ?? 0.3,
        omega: k * speed,
        phase: rand() * Math.PI * 2,
      };
    });
  };

  /** Surface height of the swell and its slope, at a point. */
  const swell = (x: number, y: number, out: Float64Array) => {
    const amp = 5.5 * clamp(cfg?.bob ?? 0, 0, 1);
    let z = 0;
    let sx = 0;
    let sy = 0;
    for (const wv of waves) {
      const arg = wv.kx * x + wv.ky * y - wv.omega * clock + wv.phase;
      const s = Math.sin(arg);
      const co = Math.cos(arg);
      z += wv.amp * s;
      sx += wv.amp * wv.kx * co;
      sy += wv.amp * wv.ky * co;
    }
    out[0] = z * amp;
    out[1] = sx * amp;
    out[2] = sy * amp;
  };

  const rippleAt = (x: number, y: number) => {
    if (!rippleLive || cols < 2) return 0;
    const i = clamp(Math.round(x / CELL) + 1, 0, cols - 1);
    const j = clamp(Math.round(y / CELL) + 1, 0, rows - 1);
    return cur[j * cols + i] ?? 0;
  };

  const shadowSprite = () => {
    shadow.width = 64;
    shadow.height = 32;
    const s = shadow.getContext("2d");
    if (!s) return;
    s.clearRect(0, 0, 64, 32);
    const g = s.createRadialGradient(32, 16, 0, 32, 16, 32);
    const r = colours[12] ?? 30;
    const gg = colours[13] ?? 40;
    const b = colours[14] ?? 60;
    g.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 0.55)`);
    g.addColorStop(0.55, `rgba(${r}, ${gg}, ${b}, 0.25)`);
    g.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    s.setTransform(1, 0, 0, 0.5, 0, 8);
    s.fillStyle = g;
    s.fillRect(0, 0, 64, 64);
    s.setTransform(1, 0, 0, 1, 0, 0);
  };

  const size = () => {
    const c = cfg;
    if (!c) return false;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const bw = Math.max(1, Math.floor(nw * dpr));
    const bh = Math.max(1, Math.floor(nh * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    if (nw !== w || nh !== h) {
      w = nw;
      h = nh;
      cols = Math.ceil(w / CELL) + 2;
      rows = Math.ceil(h / CELL) + 2;
      prev = new Float32Array(cols * rows);
      cur = new Float32Array(cols * rows);
      rippleLive = false;
      water.width = cols;
      water.height = rows;
      image = wctx ? wctx.createImageData(cols, rows) : null;
    }
    return true;
  };

  /** Homes from the wrapped cluster: each tag's layout box, untouched by its transform. */
  const measure = () => {
    const next: Body[] = [];
    for (const [id, hd] of handles) {
      const node = hd.node;
      if (!node) continue;
      // Layout boxes, not transformed ones, summed up to the water's own box.
      let ox = 0;
      let oy = 0;
      let parent = node.offsetParent;
      while (parent instanceof HTMLElement && parent !== root) {
        ox += parent.offsetLeft;
        oy += parent.offsetTop;
        parent = parent.offsetParent;
      }
      const tw = node.offsetWidth;
      const th = node.offsetHeight;
      const hx = ox + node.offsetLeft + tw / 2;
      const hy = oy + node.offsetTop + th / 2;
      const was = bodies.find((b) => b.id === id);
      next.push({
        id,
        hx,
        hy,
        w: tw,
        h: th,
        dx: was ? was.dx + was.hx - hx : 0,
        dy: was ? was.dy + was.hy - hy : 0,
        vx: was?.vx ?? 0,
        vy: was?.vy ?? 0,
        yaw: was?.yaw ?? 0,
        spin: was?.spin ?? 0,
        z: was?.z ?? 0,
        slope: was?.slope ?? 0,
        sway: (next.length * 0.618) % 1,
      });
    }
    bodies = next;
  };

  const sample = new Float64Array(3);

  /** One physics step for the tags. Returns whether any still moves. */
  const physics = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const drift = clamp(c.drift, 0, 1);
    const slack = 22 + 78 * drift;
    const pull = 240 * drift;
    const active = hand.present && c.interactive && drift > 0;
    let moving = false;
    for (const b of bodies) {
      const px = b.hx + b.dx;
      const py = b.hy + b.dy;
      let fx = 0;
      let fy = 0;
      if (active) {
        const ex = hand.x - px;
        const ey = hand.y - py;
        const d = Math.hypot(ex, ey) || 1;
        // A soft sink: strong at middle distance, gentle far off and at the hand.
        const speed = (pull * d) / (d + 60) / (1 + (d / 260) ** 2);
        fx = (ex / d) * speed;
        fy = (ey / d) * speed;
        const wake = Math.exp(-((d / 95) ** 2)) * 0.35;
        fx += hand.vx * wake;
        fy += hand.vy * wake;
      }
      let ax = (fx - b.vx) * 2.4;
      let ay = (fy - b.vy) * 2.4;
      const off = Math.hypot(b.dx, b.dy);
      if (off > slack) {
        const k = (off - slack) * 10;
        ax -= (b.dx / off) * k;
        ay -= (b.dy / off) * k;
      }
      // A mooring always draws its buoy home, slowly.
      ax -= b.dx * 0.8;
      ay -= b.dy * 0.8;
      b.vx += ax * dt;
      b.vy += ay * dt;
      b.dx += b.vx * dt;
      b.dy += b.vy * dt;
      // Yaw: knocked by collisions, turned square again by the mooring.
      b.spin += (-b.yaw * 7 - b.spin * 3.2) * dt;
      b.yaw = clamp(b.yaw + b.spin * dt, -0.17, 0.17);
      if (
        Math.abs(b.vx) > 0.4 ||
        Math.abs(b.vy) > 0.4 ||
        Math.abs(b.spin) > 0.01 ||
        Math.abs(b.yaw) > 0.002 ||
        (!active && off > 0.3)
      ) {
        moving = true;
      }
    }

    // Capsule against capsule: push apart, trade a little momentum, and spin
    // the one struck off centre. Two passes, so a crowd settles without
    // floats sliding over each other.
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < bodies.length; i += 1) {
        const a = bodies[i];
        if (!a) continue;
        for (let j = i + 1; j < bodies.length; j += 1) {
          const b = bodies[j];
          if (!b) continue;
          const ra = a.h / 2;
          const rb = b.h / 2;
          const axc = a.hx + a.dx;
          const ayc = a.hy + a.dy;
          const bxc = b.hx + b.dx;
          const byc = b.hy + b.dy;
          if (
            Math.abs(axc - bxc) > (a.w + b.w) / 2 + 4 ||
            Math.abs(ayc - byc) > (a.h + b.h) / 2 + 12
          ) {
            continue;
          }
          const ha = Math.max(0, a.w / 2 - ra);
          const hb = Math.max(0, b.w / 2 - rb);
          const ca = Math.cos(a.yaw);
          const sa = Math.sin(a.yaw);
          const cb = Math.cos(b.yaw);
          const sb = Math.sin(b.yaw);
          closest(
            axc - ca * ha,
            ayc - sa * ha,
            axc + ca * ha,
            ayc + sa * ha,
            bxc - cb * hb,
            byc - sb * hb,
            bxc + cb * hb,
            byc + sb * hb,
            pair,
          );
          const nx0 = (pair[2] ?? 0) - (pair[0] ?? 0);
          const ny0 = (pair[3] ?? 0) - (pair[1] ?? 0);
          const d = Math.hypot(nx0, ny0) || 0.001;
          const overlap = ra + rb + 3 - d;
          if (overlap <= 0) continue;
          const nx = nx0 / d;
          const ny = ny0 / d;
          a.dx -= nx * overlap * 0.5;
          a.dy -= ny * overlap * 0.5;
          b.dx += nx * overlap * 0.5;
          b.dy += ny * overlap * 0.5;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0 && pass === 0) {
            const jn = (-(1 + 0.25) * rel) / 2;
            a.vx -= nx * jn;
            a.vy -= ny * jn;
            b.vx += nx * jn;
            b.vy += ny * jn;
            const armA =
              ((pair[0] ?? 0) - axc) * ny - ((pair[1] ?? 0) - ayc) * nx;
            const armB =
              ((pair[2] ?? 0) - bxc) * ny - ((pair[3] ?? 0) - byc) * nx;
            a.spin -= (armA * jn) / (a.w * a.w * 0.08);
            b.spin += (armB * jn) / (b.w * b.w * 0.08);
          }
          moving = true;
        }
      }
    }

    // The edges of the water are a soft quay.
    for (const b of bodies) {
      const pad = 4;
      const left = b.hx + b.dx - b.w / 2;
      const right = b.hx + b.dx + b.w / 2;
      const top = b.hy + b.dy - b.h / 2;
      const bottom = b.hy + b.dy + b.h / 2;
      if (left < pad) {
        b.dx += pad - left;
        b.vx = Math.abs(b.vx) * 0.3;
      } else if (right > w - pad) {
        b.dx -= right - (w - pad);
        b.vx = -Math.abs(b.vx) * 0.3;
      }
      if (top < pad) {
        b.dy += pad - top;
        b.vy = Math.abs(b.vy) * 0.3;
      } else if (bottom > h - pad) {
        b.dy -= bottom - (h - pad);
        b.vy = -Math.abs(b.vy) * 0.3;
      }
    }
    return moving;
  };

  /** The wave equation on the grid. Returns whether any ripple is left. */
  const ripple = (): boolean => {
    let peak = 0;
    const next = prev;
    for (let j = 1; j < rows - 1; j += 1) {
      for (let i = 1; i < cols - 1; i += 1) {
        const k = j * cols + i;
        const v =
          ((cur[k - 1] ?? 0) +
            (cur[k + 1] ?? 0) +
            (cur[k - cols] ?? 0) +
            (cur[k + cols] ?? 0)) *
            0.5 -
          (next[k] ?? 0);
        const damped = v * 0.982;
        next[k] = damped;
        peak = Math.max(peak, Math.abs(damped));
      }
    }
    prev = cur;
    cur = next;
    if (peak < 0.02) {
      prev.fill(0);
      cur.fill(0);
      return false;
    }
    return true;
  };

  const impulse = (x: number, y: number, amount: number, radius: number) => {
    if (cols < 3) return;
    const ci = Math.round(x / CELL) + 1;
    const cj = Math.round(y / CELL) + 1;
    const r = Math.max(1, Math.round(radius / CELL));
    for (let j = cj - r; j <= cj + r; j += 1) {
      for (let i = ci - r; i <= ci + r; i += 1) {
        if (i < 1 || j < 1 || i >= cols - 1 || j >= rows - 1) continue;
        const d = Math.hypot(i - ci, j - cj) / r;
        if (d > 1) continue;
        const k = j * cols + i;
        cur[k] = (cur[k] ?? 0) - amount * (0.5 + 0.5 * Math.cos(d * Math.PI));
      }
    }
    rippleLive = true;
  };

  const paintWater = () => {
    const c = cfg;
    const img = image;
    if (!c || !img || !wctx) return;
    const depth = clamp(c.depth, 0, 1);
    const data = img.data;
    const sr = colours[0] ?? 200;
    const sg = colours[1] ?? 220;
    const sb = colours[2] ?? 230;
    const dr = colours[3] ?? 100;
    const dg = colours[4] ?? 140;
    const db = colours[5] ?? 180;
    const cr = colours[6] ?? 250;
    const cg = colours[7] ?? 250;
    const cb = colours[8] ?? 250;
    const deepen = 0.22 + 0.5 * depth;
    for (let j = 0; j < rows; j += 1) {
      const y = (j - 1) * CELL;
      // Further up the water is further away: a touch lighter, like a sky in it.
      const far = 1 - j / Math.max(1, rows - 1);
      for (let i = 0; i < cols; i += 1) {
        const x = (i - 1) * CELL;
        const k = j * cols + i;
        swell(x, y, sample);
        let sx = sample[1] ?? 0;
        let sy = sample[2] ?? 0;
        if (rippleLive && i > 0 && j > 0 && i < cols - 1 && j < rows - 1) {
          sx += ((cur[k + 1] ?? 0) - (cur[k - 1] ?? 0)) * 0.09;
          sy += ((cur[k + cols] ?? 0) - (cur[k - cols] ?? 0)) * 0.09;
        }
        const shade = clamp(0.5 - sx * 1.7 - sy * 2.2, 0, 1);
        let mix = clamp(deepen + (0.5 - shade) * 0.9 - far * 0.18, 0, 1);
        mix = mix * mix * (3 - 2 * mix);
        let r = sr + (dr - sr) * mix;
        let g = sg + (dg - sg) * mix;
        let b = sb + (db - sb) * mix;
        const glint = clamp((shade - 0.74) / 0.16, 0, 1);
        const gl = glint * glint * 0.85;
        r += (cr - r) * gl;
        g += (cg - g) * gl;
        b += (cb - b) * gl;
        const o = k * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    wctx.putImageData(img, 0, 0);
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !visible.current || w < 1) return;
    paintWater();
    const sx = canvas.width / w;
    const sy = canvas.height / h;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = 1;
    // Cell i is sampled at x = (i - 1) * CELL, the centre of its drawn pixel.
    ctx.drawImage(water, -CELL * 1.5, -CELL * 1.5, cols * CELL, rows * CELL);
    const depth = clamp(c.depth, 0, 1);

    // Moorings: from the float down to its anchor, fading into the water.
    if (c.moorings) {
      ctx.strokeStyle = lineStyle;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      const drop = 18 + 46 * depth;
      for (const b of bodies) {
        const x0 = b.hx + b.dx;
        const y0 = b.hy + b.dy + b.h * 0.3;
        const x1 = b.hx + (b.sway - 0.5) * 10;
        const y1 = b.hy + b.h * 0.3 + drop;
        const sag = Math.max(
          0,
          1 - Math.hypot(b.dx, b.dy) / (22 + 78 * c.drift),
        );
        ctx.globalAlpha = 0.34 - depth * 0.12;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(
          (x0 + x1) / 2 + sag * 8,
          (y0 + y1) / 2 + sag * 6,
          x1,
          y1,
        );
        ctx.stroke();
      }
    }

    // Shadows on the water: further off and softer the higher a float rides
    // and the deeper the water; gone while it is under.
    const fall = 3 + 8 * depth;
    for (const b of bodies) {
      const sink = handles.get(b.id)?.sink.get() ?? 0;
      const under = clamp(sink, 0, 1);
      const pop = clamp(-sink, 0, 1);
      const spread = 1.05 + 0.02 * Math.max(0, b.z) + pop * 0.25;
      ctx.globalAlpha = clamp(0.5 - depth * 0.15, 0, 1) * (1 - under * 0.9);
      const sw = b.w * spread;
      const sh = b.h * (1.25 + pop * 0.3);
      ctx.drawImage(
        shadow,
        b.hx + b.dx - sw / 2,
        b.hy + b.dy - sh / 2 + fall + Math.max(0, b.z) * 0.6 + pop * 4,
        sw,
        sh,
      );
    }

    // Splash rings, seen at a slant.
    ctx.strokeStyle = crestStyle;
    for (const rg of rings) {
      if (!rg.on) continue;
      const fade = Math.max(0, 1 - rg.age / 0.95);
      const grow = c.motionSafe ? 14 + rg.age * 120 : 26;
      for (let k = 0; k < 2; k += 1) {
        const r = grow - k * 16;
        if (r <= 2) continue;
        ctx.globalAlpha = fade * fade * rg.strength * (k === 0 ? 0.9 : 0.55);
        ctx.lineWidth = k === 0 ? 1.6 : 1.1;
        ctx.beginPath();
        ctx.ellipse(rg.x, rg.y, r, r * 0.46, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Writes every float's place, lift and rock to its motion values. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    const rockDeg = 26 * clamp(c.bob, 0, 1);
    for (const b of bodies) {
      const hd = handles.get(b.id);
      if (!hd) continue;
      const px = b.hx + b.dx;
      const py = b.hy + b.dy;
      swell(px, py, sample);
      const z = (sample[0] ?? 0) - rippleAt(px, py) * 0.7;
      b.z = z;
      b.slope = sample[1] ?? 0;
      hd.x.set(r2(b.dx));
      hd.y.set(r2(b.dy - z * 0.4));
      hd.rotate.set(
        r2(clamp(b.slope * rockDeg + (b.yaw * 180) / Math.PI, -18, 18)),
      );
      hd.lift.set(r3(clamp(z / 6, -1.5, 1.5)));
    }
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    const live = c.motionSafe && !c.paused;
    if (live) {
      clock += dt;
      physicsAcc += dt;
      while (physicsAcc >= STEP) {
        physicsAcc -= STEP;
        if (physics(STEP)) moving = true;
      }
      if (rippleLive) {
        rippleAcc += dt;
        while (rippleAcc >= RIPPLE_STEP && rippleLive) {
          rippleAcc -= RIPPLE_STEP;
          rippleLive = ripple();
        }
        if (rippleLive) moving = true;
      }
      if (c.bob > 0) moving = true;
      // Hand speed decays when it stops moving.
      hand.vx *= Math.exp(-dt * 8);
      hand.vy *= Math.exp(-dt * 8);
    }
    for (const rg of rings) {
      if (!rg.on) continue;
      rg.age += dt;
      if (rg.age > 0.95) rg.on = false;
      else moving = true;
    }
    for (const hd of handles.values()) {
      if (hd.sink.isAnimating()) moving = true;
    }
    place();
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < Math.min(kids.length, 5); i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    lineStyle = `rgb(${colours[9] ?? 90}, ${colours[10] ?? 90}, ${colours[11] ?? 90})`;
    crestStyle = `rgb(${colours[6] ?? 250}, ${colours[7] ?? 250}, ${colours[8] ?? 250})`;
    shadowSprite();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (
        !was ||
        was.seed !== next.seed ||
        was.depth !== next.depth ||
        was.bob !== next.bob
      ) {
        lay();
      }
      if (!was) readColours();
      if (!was || was.dpr !== next.dpr) size();
      if (!next.interactive) {
        hand.present = false;
        hand.source = null;
      }
      if (!next.motionSafe) {
        // A still: tags at home, flat ripples, the swell frozen.
        for (const b of bodies) {
          b.dx = 0;
          b.dy = 0;
          b.vx = 0;
          b.vy = 0;
          b.yaw = 0;
          b.spin = 0;
        }
        prev.fill(0);
        cur.fill(0);
        rippleLive = false;
      }
      place();
      draw();
      kick();
    },
    measure() {
      if (!size()) return;
      measure();
      place();
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    wake() {
      place();
      draw();
      kick();
    },
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      if (hand.present && hand.source === "pointer" && source === "pointer") {
        // Velocity of the hand, smoothed, for the wake it drags.
        hand.vx = hand.vx * 0.6 + (x - hand.x) * 0.4 * 60;
        hand.vy = hand.vy * 0.6 + (y - hand.y) * 0.4 * 60;
        if (c.motionSafe && Math.hypot(x - hand.x, y - hand.y) > 6) {
          impulse(x, y, 0.35, 10);
        }
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      kick();
    },
    splashAt(id) {
      const c = cfg;
      const b = bodies.find((x) => x.id === id);
      if (!c || !b) return;
      const strength = clamp(c.splash, 0, 1);
      const x = b.hx + b.dx;
      const y = b.hy + b.dy;
      if (c.motionSafe && !c.paused) {
        impulse(x, y, 6.5 * strength, Math.max(10, b.h * 0.7));
      }
      let pick = rings[0];
      for (const rg of rings) {
        if (!rg.on) {
          pick = rg;
          break;
        }
        if (pick && rg.age > pick.age) pick = rg;
      }
      if (pick && strength > 0) {
        pick.on = true;
        pick.x = x;
        pick.y = y + b.h * 0.15;
        pick.age = 0;
        pick.strength = 0.35 + 0.65 * strength;
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

/* ----------------------------------- tag ---------------------------------- */

type TagProps = {
  tag: BuoyTag;
  paint: string;
  selected: boolean;
  shown: boolean;
  disabled: boolean;
  register: (id: string, handles: TagHandles | null) => void;
  onPress: (tag: BuoyTag, event: React.MouseEvent<HTMLButtonElement>) => void;
  onFocusTag: (event: React.FocusEvent<HTMLButtonElement>) => void;
  onBlurTag: () => void;
};

/**
 * One float: a pill with a painted buoy at its end, riding the water. Where
 * it sits, how high it rides and how it rocks are motion values written by
 * the water each frame; its dunk is its own `sink` value.
 */
function Tag({
  tag,
  paint,
  selected,
  shown,
  disabled,
  register,
  onPress,
  onFocusTag,
  onBlurTag,
}: TagProps) {
  const x = useMotionValue(0);
  const yBase = useMotionValue(0);
  const rotate = useMotionValue(0);
  const lift = useMotionValue(0);
  const sink = useMotionValue(0);
  const handles = React.useRef<TagHandles>({
    x,
    y: yBase,
    rotate,
    lift,
    sink,
    node: null,
  });

  // Under, it sinks a little; popping back up it rides high for a moment.
  const y = useTransform([yBase, sink] as MotionValue<number>[], ([b, s]) => {
    const sv = s as number;
    return r2((b as number) + (sv >= 0 ? sv * 8 : Math.max(-1, sv) * 12));
  });
  const scale = useTransform(
    [lift, sink] as MotionValue<number>[],
    ([l, s]) => {
      const sv = s as number;
      return r3(
        (1 + (l as number) * 0.012) *
          (1 - 0.1 * clamp(sv, 0, 1)) *
          (1 + 0.1 * clamp(-sv, 0, 1)),
      );
    },
  );
  const waterline = useTransform(
    [lift, sink] as MotionValue<number>[],
    ([l, s]) =>
      r3(
        clamp(0.3 - (l as number) * 0.1 + clamp(s as number, -0.3, 1), 0.06, 1),
      ),
  );
  const cover = useTransform(sink, (s) => r3(clamp(s, 0, 1) * 0.72));

  const bind = React.useCallback(
    (node: HTMLButtonElement | null) => {
      handles.current.node = node;
      register(tag.id, node ? handles.current : null);
    },
    [register, tag.id],
  );

  return (
    <motion.button
      ref={bind}
      type="button"
      data-buoy=""
      aria-pressed={selected}
      disabled={disabled}
      onClick={(event) => onPress(tag, event)}
      onFocus={onFocusTag}
      onBlur={onBlurTag}
      data-on={shown ? "" : undefined}
      style={
        {
          x,
          y,
          rotate,
          scale,
          "--buoy-paint": paint,
        } as React.ComponentProps<typeof motion.button>["style"]
      }
      className={cn(
        "relative inline-flex h-8 shrink-0 items-center gap-2 overflow-hidden rounded-full border border-hairline-strong bg-card pr-3.5 pl-1.5 text-sm font-medium text-foreground shadow-sm transition-colors select-none",
        "data-on:border-[color-mix(in_oklab,var(--buoy-paint)_70%,var(--hairline-strong))] data-on:bg-[color-mix(in_oklab,var(--buoy-paint)_18%,var(--card))]",
        "cursor-pointer outline-none disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    >
      <span
        aria-hidden
        className="relative grid size-5 shrink-0 place-items-center rounded-full"
        style={{
          backgroundColor: paint,
          backgroundImage:
            "radial-gradient(circle at 34% 30%, oklch(1 0 0 / 0.6), transparent 46%), linear-gradient(transparent 44%, oklch(1 0 0 / 0.85) 44%, oklch(1 0 0 / 0.85) 58%, transparent 58%)",
        }}
      >
        {shown ? (
          <svg
            viewBox="0 0 12 12"
            className="relative size-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "oklch(0.25 0.03 250)" }}
          >
            <path d="M2.5 6.4 5 8.6 9.5 3.6" />
          </svg>
        ) : null}
      </span>
      <span className="relative whitespace-nowrap">{tag.label}</span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-full"
        style={{
          scaleY: waterline,
          originY: 1,
          backgroundImage: `linear-gradient(to top, ${WATER_TINT}, transparent 85%)`,
        }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ opacity: cover, backgroundColor: DEEP }}
      />
    </motion.button>
  );
}

/* -------------------------------- component ------------------------------ */

/**
 * A tag picker floating on water. Each tag is a toggle button shaped like a
 * float, moored on a slack line to its place in a wrapped cluster, riding a
 * gently moving surface: a slow swell of long waves lifts and rocks one float
 * after another, so the row bobs as a row of buoys does. The hand makes a
 * current — water drawn toward the pointer and dragged along with it — and
 * the floats drift to you within the slack of their moorings, crowding round
 * and bumping softly into each other (capsules that trade momentum and spin
 * when struck off centre), then drift home when you leave.
 *
 * Pressing a tag dunks it: it goes under on a short ease, comes back up on
 * springs.recoil — overshooting the surface twice — inside a splash ring, and
 * the waves of the splash rock its neighbours. It surfaces selected (or not):
 * the state changes at once for assistive technology and in sight at the
 * bottom of the dunk. Tags are real buttons in reading order, Enter and Space
 * dunk them, and keyboard focus pulls the current to the focused tag. The
 * water runs only on screen in a visible page; under reduced motion it lies
 * still, the tags sit at home and a press swaps the look with a short dip.
 */
export function BuoyTags({
  tags = defaultBuoyTags,
  value,
  defaultValue,
  onValueChange,
  multiple = true,
  bob = 0.5,
  drift = 0.5,
  depth = 0.5,
  moorings = true,
  splash = 0.7,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  sound = false,
  label = "Tags",
  onDunk,
  disabled = false,
  className,
}: BuoyTagsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const [own, setOwn] = React.useState<string[]>(() => defaultValue ?? []);
  const selected = value ?? own;
  /** A dunked tag keeps its old look until it is under water. */
  const [held, setHeld] = React.useState<Record<string, boolean>>({});
  const [said, setSaid] = React.useState({ text: "", n: 0 });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const handles = React.useRef(new Map<string, TagHandles>());
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);

  const enabled = !disabled;
  const config: Config = {
    bob: disabled ? 0 : bob,
    drift,
    depth,
    moorings,
    splash,
    interactive: interactive && enabled,
    paused: paused || disabled,
    seed,
    dpr,
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
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, handles.current, visible);
    engine.current = e;
    e.configure(latest.current);
    e.measure();
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
    const anims = running.current;
    const pending = timers.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const a of anims.values()) a.stop();
      anims.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  // A new set of tags lays a new cluster.
  const tagKey = tags.map((t) => `${t.id}:${t.label}`).join("|");
  React.useEffect(() => {
    engine.current?.measure();
  }, [tagKey]);

  const register = React.useCallback((id: string, h: TagHandles | null) => {
    if (h) handles.current.set(id, h);
    else handles.current.delete(id);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.measure());
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

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const dunk = (id: string, look: boolean, clientX: number | null) => {
    const hd = handles.current.get(id);
    if (!hd) return;
    running.current.get(id)?.stop();
    const root = rootRef.current;
    const node = hd.node;
    const rect = node?.getBoundingClientRect();
    const pan =
      clientX !== null
        ? panFrom(clientX, root)
        : rect
          ? panFrom(rect.left + rect.width / 2, root)
          : 0;
    onDunk?.(id);
    audio.play("plip", { pitch: 0.72, gain: 0.55, pan });
    if (!motionSafe) {
      setHeld((h) => {
        const next = { ...h };
        delete next[id];
        return next;
      });
      hd.sink.jump(0);
      if (node) {
        node.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], {
          duration: durations.base * 1000,
          easing: "ease-in-out",
        });
      }
      engine.current?.splashAt(id);
      return;
    }
    setHeld((h) => ({ ...h, [id]: !look }));
    engine.current?.wake();
    const down = animate(hd.sink, 1, {
      duration: 0.15,
      ease: easings.exit,
      onComplete: () => {
        // Under water: it takes its new look, and the splash goes up.
        setHeld((h) => {
          const next = { ...h };
          delete next[id];
          return next;
        });
        engine.current?.splashAt(id);
        const up = animate(hd.sink, 0, { ...springs.recoil, velocity: -13 });
        running.current.set(id, up);
        engine.current?.wake();
        timers.current.push(
          window.setTimeout(
            () => audio.play("plip", { pitch: 1.35, gain: 0.45, pan }),
            170,
          ),
        );
      },
    });
    running.current.set(id, down);
  };

  const press = (tag: BuoyTag, event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const on = selected.includes(tag.id);
    const next = on
      ? selected.filter((id) => id !== tag.id)
      : multiple
        ? [...selected, tag.id]
        : [tag.id];
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    const count = next.length;
    setSaid((s) => ({
      text: `${tag.label} ${on ? "cleared" : "selected"}. ${count} selected.`,
      n: s.n + 1,
    }));
    dunk(tag.id, !on, event.detail === 0 ? null : event.clientX);
  };

  const onFocusTag = (event: React.FocusEvent<HTMLButtonElement>) => {
    const el = event.currentTarget;
    if (!el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
  };

  const onBlurTag = () => engine.current?.handAway("focus");

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.handAway("pointer");
      }}
      className={cn(
        "group/buoy-tags relative isolate h-56 w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(to bottom, ${SHALLOW}, ${DEEP})`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/buoy-tags:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[SHALLOW, DEEP, CREST, LINE, SHADE].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div
        role="group"
        aria-label={label}
        className="relative z-10 mx-auto flex size-full max-w-[34rem] flex-wrap content-center items-center justify-center gap-x-3 gap-y-4 p-4"
      >
        {tags.map((tag, i) => {
          const isOn = selected.includes(tag.id);
          return (
            <Tag
              key={tag.id}
              tag={tag}
              paint={
                tag.color ?? PIGMENTS[i % PIGMENTS.length] ?? PIGMENTS[0] ?? ""
              }
              selected={isOn}
              shown={held[tag.id] ?? isOn}
              disabled={disabled}
              register={register}
              onPress={press}
              onFocusTag={onFocusTag}
              onBlurTag={onBlurTag}
            />
          );
        })}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
