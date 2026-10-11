"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PlanktonWakeProps = {
  /** Content laid over the water: a headline, a card, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** How many plankton live in the water, per 100 × 100 px (8 to 80; capped at 3,000 in all). @default 44 */
  density?: number;
  /** How long a lit plankton takes to fade back to black, in seconds. @default 1.4 */
  glowDecay?: number;
  /** The glow's hue in degrees: 150 is sea green, 196 the classic blue-green, 250 violet blue. @default 196 */
  hue?: number;
  /** The water's colour, any CSS colour. Dark by design in both themes. @default "oklch(from var(--accent) 0.17 0.035 h)" */
  water?: string;
  /** How far either side of the pointer's path the water is stirred, px (held under 30% of the box). @default 44 */
  wakeRadius?: number;
  /** How readily a slow hand lights the water, 0 to 1; a fast one always does. @default 0.6 */
  sensitivity?: number;
  /** A click on the water sends a ring of light outward from that point. @default true */
  ring?: boolean;
  /** How fast a ring travels, px per second. @default 480 */
  ringSpeed?: number;
  /** Life in the still water, 0 to 1: a slow current and the odd lone flash. 0 holds it perfectly still. @default 0.3 */
  ambient?: number;
  /** When it first comes into view, something unseen swims across once and stirs a wake. @default true */
  intro?: boolean;
  /** The pointer stirs the water. @default true */
  interactive?: boolean;
  /** Hold the water as it is: nothing drifts, glows on or fades. @default false */
  paused?: boolean;
  /** Seeds where the plankton float and the swimmer's path. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The water's accessible name, for the keyboard's way in. @default "Dark water" */
  label?: string;
  /** A ring was sent, with how many so far. */
  onPulse?: (count: number) => void;
  /** The water started or stopped glowing from a disturbance. */
  onGlowChange?: (glowing: boolean) => void;
  /** Nothing stirs and the keyboard's way in is off. @default false */
  disabled?: boolean;
  /** Sizes the water. @default "h-56 w-full" */
  className?: string;
};

/** Anything a click should be left alone on: the reader is about to use it. */
const INTERACTIVE =
  "a[href],button:not([data-water]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1']):not([data-water])";

const MAX_PLANKTON = 3000;
/** The bloom buffer's scale: a quarter of the box each way. */
const BLOOM = 0.25;
/** The bloom: a kick swells into the glow on this time constant, s. */
const ATTACK = 0.07;
/** A spent plankton recovers its charge on this time constant, s. */
const RECHARGE = 1.2;
/** Water drag on anything the hand pushed, s. */
const DRAG = 0.6;
const INTRO_TIME = 1.8;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A seeded value in [0, 1) for plankton `i`, attribute `k`: stable per index, so a resize never reshuffles the water. */
function hash(seed: number, i: number, k: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ Math.imul(k + 7, 2246822519), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Point = { x: number; y: number };

/** The swimmer's path, in fractions of the box: a seeded S across the water. */
function swimPath(seed: number): [Point, Point, Point, Point] {
  const j = (k: number) => hash(seed, 9001, k) - 0.5;
  return [
    { x: -0.06, y: 0.52 + j(0) * 0.14 },
    { x: 0.28 + j(1) * 0.08, y: -0.08 + j(2) * 0.12 },
    { x: 0.6 + j(3) * 0.08, y: 1.08 + j(4) * 0.08 },
    { x: 1.06, y: 0.26 + j(5) * 0.16 },
  ];
}

function bezier(p: [Point, Point, Point, Point], u: number): Point {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return {
    x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x,
    y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y,
  };
}

const easeInOut = (u: number) =>
  u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

/** Turns any CSS colour into rgb through a 1×1 canvas, so oklch and tokens all land as numbers. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [140, 220, 255];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

/** The glow's three tones for a hue: white-hot core, the bloom, the faint halo. */
const glowTones = (hue: number) => {
  const h = r2(hue);
  return {
    core: `oklch(0.97 0.04 ${h})`,
    mid: `oklch(0.86 0.11 ${h})`,
    halo: `oklch(0.68 0.16 ${h})`,
  };
};

type Plankton = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0.45 (far, small, dim) to 1 (near). */
  z: number;
  glow: number;
  kick: number;
  charge: number;
  /** Under reduced motion the glow relaxes to this, not to black: the still wake. */
  rest: number;
};

type Ring = { x: number; y: number; r: number; max: number };

type Config = {
  density: number;
  glowDecay: number;
  hue: number;
  wakeRadius: number;
  sensitivity: number;
  ring: boolean;
  ringSpeed: number;
  ambient: number;
  intro: boolean;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Report = {
  onPulse?: (count: number) => void;
  onGlowChange?: (glowing: boolean) => void;
  said: (text: string) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  stir: (x: number, y: number, t: number) => void;
  lift: () => void;
  pulse: (x: number, y: number) => void;
  keyFocus: (on: boolean) => void;
  keyMove: (dx: number, dy: number) => void;
  keyPulse: () => void;
  dispose: () => void;
};

function createWater(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  report: { current: Report },
): Engine {
  const ctx = canvas.getContext("2d");
  const read = colourReader();
  let cfg: Config | null = null;
  const size = { w: 0, h: 0, dpr: 1 };
  let plankton: Plankton[] = [];
  const rings: Ring[] = [];
  let sprite: HTMLCanvasElement | null = null;
  // A quarter-resolution buffer the lit plankton are blurred into, so a dense
  // wake glows as a body of water rather than as separate dots.
  const bloom = document.createElement("canvas");
  const bctx = bloom.getContext("2d");
  let spriteHue = Number.NaN;
  let ripple = "rgb(140, 220, 255)";
  const rand = lcg(911);

  let raf = 0;
  let timer = 0;
  let last = 0;
  let t = 0;
  let visible = false;
  let disposed = false;
  let glowing = false;
  let pulses = 0;
  let painted = false;

  // The hand: the last point it stirred from, and when.
  const hand = { has: false, x: 0, y: 0, t: 0, moved: -1 };
  // Segments of stirring waiting for the next frame, flattened [x0 y0 x1 y1 speed].
  const queue: number[] = [];
  // The swimmer and the keyboard's lure both stir like a hand.
  const intro = { done: false, running: false, at: 0, x: 0, y: 0 };
  // The lure rides the house glide spring toward where the keys send it, so
  // repeated presses chain into one smooth stroke instead of hops.
  const lure = {
    on: false,
    moving: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    toX: 0,
    toY: 0,
  };

  const reach = () =>
    clamp(
      cfg?.wakeRadius ?? 44,
      8,
      Math.max(8, Math.min(size.w, size.h) * 0.3),
    );

  const ensureSprite = () => {
    const hue = cfg?.hue ?? 196;
    if (sprite && spriteHue === hue) return sprite;
    const tones = glowTones(hue);
    const core = read(tones.core);
    const mid = read(tones.mid);
    const halo = read(tones.halo);
    ripple = `rgb(${mid[0]}, ${mid[1]}, ${mid[2]})`;
    const s = sprite ?? document.createElement("canvas");
    s.width = 64;
    s.height = 64;
    const c = s.getContext("2d");
    if (c) {
      c.clearRect(0, 0, 64, 64);
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      const rgba = (v: [number, number, number], a: number) =>
        `rgba(${v[0]}, ${v[1]}, ${v[2]}, ${a})`;
      g.addColorStop(0, rgba(core, 1));
      g.addColorStop(0.12, rgba(core, 0.92));
      g.addColorStop(0.3, rgba(mid, 0.5));
      g.addColorStop(0.62, rgba(halo, 0.14));
      g.addColorStop(1, rgba(halo, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }
    sprite = s;
    spriteHue = hue;
    return s;
  };

  /** The still wake reduced motion keeps: plankton near the swimmer's path, half lit. */
  const restOf = (p: Plankton) => {
    if (!cfg || size.w <= 0) return 0;
    const path = swimPath(cfg.seed);
    const r = reach() * 1.15;
    let best = 0;
    for (let k = 0; k <= 32; k += 1) {
      const u = k / 32;
      const q = bezier(path, u);
      const d = Math.hypot(p.x - q.x * size.w, p.y - q.y * size.h);
      if (d < r) {
        const f = 1 - d / r;
        best = Math.max(best, f * f * (0.55 + 0.45 * u));
      }
    }
    return best * 0.55;
  };

  /** Builds or resizes the population, keeping each plankton's own seeded place. */
  const populate = (prevW: number, prevH: number) => {
    if (!cfg) return;
    const area = size.w * size.h;
    const n = Math.round(clamp((cfg.density * area) / 10000, 0, MAX_PLANKTON));
    const sx = prevW > 0 ? size.w / prevW : 1;
    const sy = prevH > 0 ? size.h / prevH : 1;
    const next: Plankton[] = [];
    for (let i = 0; i < n; i += 1) {
      const old = plankton[i];
      if (old && prevW > 0) {
        old.x *= sx;
        old.y *= sy;
        next.push(old);
        continue;
      }
      next.push({
        x: hash(cfg.seed, i, 0) * size.w,
        y: hash(cfg.seed, i, 1) * size.h,
        vx: 0,
        vy: 0,
        z: 0.45 + 0.55 * hash(cfg.seed, i, 2),
        glow: 0,
        kick: 0,
        charge: 1,
        rest: 0,
      });
    }
    plankton = next;
    for (const p of plankton) {
      p.rest = restOf(p);
      if (!cfg.motionSafe) p.glow = Math.max(p.glow, p.rest);
    }
  };

  const resize = () => {
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    const dpr = Math.min(
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    const prevW = size.w;
    const prevH = size.h;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    bloom.width = Math.max(1, Math.ceil(w * BLOOM));
    bloom.height = Math.max(1, Math.ceil(h * BLOOM));
    if (prevW !== w || prevH !== h || plankton.length === 0) {
      populate(prevW, prevH);
    }
    if (!lure.on) {
      lure.x = w / 2;
      lure.y = h / 2;
    }
    draw();
    wake();
  };

  /** Stirs the water along one stretch of a moving hand. */
  const stirSegment = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    speed: number,
  ) => {
    if (!cfg) return;
    const R = reach();
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    const ux = len > 0.001 ? dx / len : 0;
    const uy = len > 0.001 ? dy / len : 0;
    // A slow hand still lights the water; a fast one lights it hard.
    const pace = clamp(0.3 + speed / 800, 0.3, 1.5);
    const amount = (0.4 + 0.6 * clamp(cfg.sensitivity, 0, 1)) * pace;
    // The dose is the length of path that passed within reach, not the number
    // of events that described it: a 120 Hz mouse lights no brighter than a
    // 60 Hz one.
    const dose = (Math.min(len, R) / R) * 1.6;
    const push = cfg.motionSafe ? 1 : 0;
    const minX = Math.min(x0, x1) - R;
    const maxX = Math.max(x0, x1) + R;
    const minY = Math.min(y0, y1) - R;
    const maxY = Math.max(y0, y1) + R;
    for (const p of plankton) {
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
      const u =
        len2 > 0 ? clamp(((p.x - x0) * dx + (p.y - y0) * dy) / len2, 0, 1) : 0;
      const qx = x0 + dx * u;
      const qy = y0 + dy * u;
      const ox = p.x - qx;
      const oy = p.y - qy;
      const d = Math.hypot(ox, oy);
      if (d >= R) continue;
      const f = (1 - d / R) * (1 - d / R);
      const lit = amount * f * p.charge * dose;
      p.kick += lit;
      p.charge = Math.max(0, p.charge - lit * 0.5);
      if (push) {
        // The hand drags the water along with it and parts it either side,
        // so the lit points drift apart into a soft V while they fade.
        const side = d > 0.001 ? 1 / d : 0;
        const along = Math.min(speed, 1600) * 0.22 * f * Math.min(1, dose);
        const apart = 46 * f * pace * Math.min(1, dose);
        p.vx += ux * along + ox * side * apart;
        p.vy += uy * along + oy * side * apart;
      }
    }
  };

  const ringFront = (rg: Ring, from: number, to: number) => {
    const push = cfg?.motionSafe ? 1 : 0;
    for (const p of plankton) {
      const ox = p.x - rg.x;
      const oy = p.y - rg.y;
      const d = Math.hypot(ox, oy);
      if (d < from || d >= to) continue;
      const fall = 1 - 0.55 * (d / rg.max);
      p.kick += 0.95 * fall * (0.35 + 0.65 * p.charge);
      p.charge = Math.max(0, p.charge - 0.4);
      if (push && d > 0.001) {
        p.vx += (ox / d) * 34 * fall;
        p.vy += (oy / d) * 34 * fall;
      }
    }
  };

  const step = (dt: number) => {
    if (!cfg) return;
    const motion = cfg.motionSafe;
    // The swimmer, then the lure, feed the queue like a hand would.
    if (intro.running) {
      const u = clamp((t - intro.at) / INTRO_TIME, 0, 1);
      const path = swimPath(cfg.seed);
      const q = bezier(path, easeInOut(u));
      const x = q.x * size.w;
      const y = q.y * size.h;
      const speed = Math.hypot(x - intro.x, y - intro.y) / Math.max(dt, 0.001);
      queue.push(intro.x, intro.y, x, y, speed);
      intro.x = x;
      intro.y = y;
      if (u >= 1) intro.running = false;
    }
    if (lure.moving) {
      const { stiffness: k, damping: c, mass: m } = springs.glide;
      const x0 = lure.x;
      const y0 = lure.y;
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let i = 0; i < n; i += 1) {
        lure.vx += ((-k * (lure.x - lure.toX) - c * lure.vx) / m) * h;
        lure.vy += ((-k * (lure.y - lure.toY) - c * lure.vy) / m) * h;
        lure.x += lure.vx * h;
        lure.y += lure.vy * h;
      }
      const speed = Math.hypot(lure.vx, lure.vy);
      queue.push(x0, y0, lure.x, lure.y, speed);
      if (speed < 4 && Math.hypot(lure.x - lure.toX, lure.y - lure.toY) < 0.5) {
        lure.x = lure.toX;
        lure.y = lure.toY;
        lure.vx = 0;
        lure.vy = 0;
        lure.moving = false;
      }
    }
    for (let i = 0; i + 4 < queue.length; i += 5) {
      stirSegment(
        queue[i] ?? 0,
        queue[i + 1] ?? 0,
        queue[i + 2] ?? 0,
        queue[i + 3] ?? 0,
        queue[i + 4] ?? 0,
      );
    }
    queue.length = 0;

    for (let k = rings.length - 1; k >= 0; k -= 1) {
      const rg = rings[k];
      if (!rg) continue;
      const from = rg.r;
      rg.r += clamp(cfg.ringSpeed, 60, 4000) * dt;
      ringFront(rg, from, rg.r);
      if (rg.r > rg.max) rings.splice(k, 1);
    }

    // A slow current and the odd lone flash, while the water is left alone.
    const ambient = motion ? clamp(cfg.ambient, 0, 1) : 0;
    if (ambient > 0 && plankton.length > 0) {
      const expected = ambient * plankton.length * 0.01 * dt;
      let n = Math.floor(expected + rand());
      while (n > 0) {
        const p = plankton[Math.floor(rand() * plankton.length)];
        // A lone flash goes straight to the glow: no swell to animate, so
        // the idle water keeps its slow frame rate.
        if (p) p.glow = Math.min(1.4, p.glow + 0.35 + 0.5 * rand());
        n -= 1;
      }
    }
    const current = ambient * 7;
    const decay = Math.exp((-dt * 4) / clamp(cfg.glowDecay, 0.1, 30));
    // Reduced motion lights at once (no swell) and fades by opacity alone.
    const attack = motion ? 1 - Math.exp(-dt / ATTACK) : 1;
    const recharge = 1 - Math.exp(-dt / RECHARGE);
    const drag = Math.exp(-dt / DRAG);
    const w = size.w;
    const h = size.h;
    for (const p of plankton) {
      const moved = p.kick * attack;
      p.glow += moved;
      p.kick -= moved;
      if (p.kick < 0.0005) p.kick = 0;
      const floor = motion ? 0 : p.rest;
      p.glow = floor + (p.glow - floor) * decay;
      if (p.glow < 0.002) p.glow = 0;
      p.charge += (1 - p.charge) * recharge;
      if (!motion) continue;
      p.vx *= drag;
      p.vy *= drag;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
      if (Math.abs(p.vy) < 0.05) p.vy = 0;
      let fx = 0;
      let fy = 0;
      if (current > 0) {
        const a = 0.55 * Math.sin(p.y * 0.011 + t * 0.07) + 0.3;
        fx = Math.cos(a) * current * p.z;
        fy = Math.sin(a) * current * 0.4 * p.z;
      }
      p.x += (p.vx + fx) * dt;
      p.y += (p.vy + fy) * dt;
      // The water wraps: what drifts out one side drifts in the other.
      if (p.x < -6) p.x += w + 12;
      else if (p.x > w + 6) p.x -= w + 12;
      if (p.y < -6) p.y += h + 12;
      else if (p.y > h + 6) p.y -= h + 12;
    }
  };

  const draw = () => {
    if (!ctx || size.w <= 0) return;
    const img = ensureSprite();
    const d = size.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.globalCompositeOperation = "lighter";
    let lit = 0;
    if (bctx) {
      bctx.setTransform(BLOOM, 0, 0, BLOOM, 0, 0);
      bctx.globalCompositeOperation = "source-over";
      bctx.globalAlpha = 1;
      bctx.clearRect(0, 0, size.w, size.h);
      bctx.globalCompositeOperation = "lighter";
    }
    for (const p of plankton) {
      const g = p.glow;
      const depth = 0.55 + 0.45 * p.z;
      const grow = cfg?.motionSafe ? Math.min(g, 1.4) : g > 0.02 ? 0.6 : 0;
      const dia = (2.4 + 8 * grow) * depth;
      ctx.globalAlpha = Math.min(1, 0.09 + 0.08 * p.z + 0.95 * g);
      ctx.drawImage(img, p.x - dia / 2, p.y - dia / 2, dia, dia);
      if (bctx && g > 0.04) {
        lit += 1;
        const wide = (16 + 26 * grow) * depth;
        bctx.globalAlpha = Math.min(0.55, 0.4 * g);
        bctx.drawImage(img, p.x - wide / 2, p.y - wide / 2, wide, wide);
      }
    }
    if (lit > 0) {
      ctx.globalAlpha = 0.85;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bloom, 0, 0, size.w, size.h);
    }
    ctx.globalAlpha = 1;
    if (cfg?.motionSafe) {
      ctx.strokeStyle = ripple;
      ctx.lineWidth = 1;
      for (const rg of rings) {
        const a = 0.08 * (1 - rg.r / rg.max);
        if (a <= 0.002) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (lure.on) {
      // The keyboard's light: a small soft marker that shows where it is.
      const dia = 26;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(img, lure.x - dia / 2, lure.y - dia / 2, dia, dia);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, lure.x - 4, lure.y - 4, 8, 8);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!painted) {
      painted = true;
      root.setAttribute("data-live", "");
    }
  };

  /** What the water is doing: busy wants every frame, idle a slow one, still none. */
  const activity = (): "busy" | "idle" | "still" => {
    if (!cfg) return "still";
    if (
      intro.running ||
      lure.moving ||
      rings.length > 0 ||
      queue.length > 0 ||
      performance.now() - hand.moved < 160
    ) {
      return "busy";
    }
    let glow = 0;
    let kick = 0;
    let vel = 0;
    for (const p of plankton) {
      if (p.glow - p.rest > glow) glow = p.glow - p.rest;
      if (p.kick > kick) kick = p.kick;
      const v = Math.abs(p.vx) + Math.abs(p.vy);
      if (v > vel) vel = v;
    }
    const lit = glow > 0.12 ? true : glow < 0.04 ? false : glowing;
    if (lit !== glowing) {
      glowing = lit;
      report.current.onGlowChange?.(lit);
    }
    if (kick > 0.02 || vel > 3) return "busy";
    if (glow > 0.01 || (cfg.motionSafe && cfg.ambient > 0)) return "idle";
    return "still";
  };

  const canRun = () => visible && !document.hidden && !disposed && !cfg?.paused;

  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };

  const tick = (now: number) => {
    raf = 0;
    // Idle frames come ~60 ms apart; anything longer is a pause, not time.
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    last = now;
    t += dt;
    step(dt);
    draw();
    if (!canRun()) return;
    const mode = activity();
    if (mode === "busy") raf = requestAnimationFrame(tick);
    else if (mode === "idle") {
      // A drifting, slowly fading sea needs nowhere near every frame.
      timer = window.setTimeout(() => {
        timer = 0;
        if (canRun()) raf = requestAnimationFrame(tick);
      }, 45);
    }
  };

  function wake() {
    if (raf || !canRun()) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  const startIntro = () => {
    if (!cfg || intro.done || !cfg.intro || !cfg.motionSafe || !visible) return;
    if (size.w <= 0) return;
    intro.done = true;
    intro.running = true;
    intro.at = t;
    const q = bezier(swimPath(cfg.seed), 0);
    intro.x = q.x * size.w;
    intro.y = q.y * size.h;
    wake();
  };

  const pulse = (x: number, y: number) => {
    if (!cfg || !cfg.ring || cfg.paused) return;
    const far = Math.max(
      Math.hypot(x, y),
      Math.hypot(size.w - x, y),
      Math.hypot(x, size.h - y),
      Math.hypot(size.w - x, size.h - y),
    );
    if (cfg.motionSafe) {
      if (rings.length >= 4) rings.shift();
      rings.push({ x, y, r: 0, max: far + 8 });
    } else {
      // No travelling front: everything in reach lights at once, then fades.
      const reachAll = Math.min(size.w, size.h) * 0.55;
      for (const p of plankton) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < reachAll) p.kick += 0.8 * (1 - d / reachAll);
      }
    }
    pulses += 1;
    report.current.onPulse?.(pulses);
    report.current.said("Ring sent.");
    hand.moved = performance.now();
    wake();
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (
        !prev ||
        prev.density !== next.density ||
        prev.seed !== next.seed ||
        prev.wakeRadius !== next.wakeRadius
      ) {
        if (prev && prev.seed !== next.seed) plankton = [];
        populate(size.w, size.h);
      }
      if (prev && prev.motionSafe !== next.motionSafe) {
        for (const p of plankton) {
          p.rest = restOf(p);
          p.vx = 0;
          p.vy = 0;
          if (!next.motionSafe) p.glow = Math.max(p.glow, p.rest);
        }
        if (!next.motionSafe) {
          intro.running = false;
          rings.length = 0;
        }
      }
      if (prev && prev.dpr !== next.dpr) resize();
      if (next.paused) halt();
      draw();
      startIntro();
      wake();
    },
    resize,
    setVisible: (on) => {
      visible = on;
      if (!on) {
        halt();
        return;
      }
      startIntro();
      wake();
    },
    stir: (x, y, at) => {
      if (!cfg || !cfg.interactive || cfg.paused) return;
      intro.running = false;
      if (hand.has) {
        const dt = Math.max(0.004, (at - hand.t) / 1000);
        const speed = Math.hypot(x - hand.x, y - hand.y) / dt;
        if (queue.length < 60) queue.push(hand.x, hand.y, x, y, speed);
        else {
          // A burst of events between frames: fold into the last stretch.
          queue[queue.length - 3] = x;
          queue[queue.length - 2] = y;
        }
      }
      hand.has = true;
      hand.x = x;
      hand.y = y;
      hand.t = at;
      hand.moved = performance.now();
      wake();
    },
    lift: () => {
      hand.has = false;
    },
    pulse,
    keyFocus: (on) => {
      lure.on = on;
      if (on && cfg && !intro.running) {
        lure.x = clamp(lure.x, 8, size.w - 8);
        lure.y = clamp(lure.y, 8, size.h - 8);
      }
      draw();
      wake();
    },
    keyMove: (dx, dy) => {
      if (!cfg) return;
      intro.running = false;
      const fromX = lure.moving ? lure.toX : lure.x;
      const fromY = lure.moving ? lure.toY : lure.y;
      const toX = clamp(fromX + dx, 8, Math.max(8, size.w - 8));
      const toY = clamp(fromY + dy, 8, Math.max(8, size.h - 8));
      if (!cfg.motionSafe || cfg.paused) {
        // Held water only moves the light; reduced motion lights the whole
        // stretch at once instead of gliding the light along it.
        if (!cfg.paused) stirSegment(lure.x, lure.y, toX, toY, 700);
        lure.x = toX;
        lure.y = toY;
        lure.toX = toX;
        lure.toY = toY;
        lure.moving = false;
        draw();
        hand.moved = performance.now();
        wake();
        return;
      }
      lure.toX = toX;
      lure.toY = toY;
      lure.moving = true;
      wake();
    },
    keyPulse: () => pulse(lure.x, lure.y),
    dispose: () => {
      disposed = true;
      halt();
    },
  };
}

/** The server's frame and reduced motion's look-alike: motes and a still, glowing wake. */
function standIn(seed: number) {
  const path = swimPath(seed);
  const motes = Array.from({ length: 64 }, (_, i) => ({
    i,
    x: r2(hash(seed, i, 0) * 100),
    y: r2(hash(seed, i, 1) * 100),
    r: r2(0.7 + 0.8 * hash(seed, i, 2)),
    o: r2(0.12 + 0.16 * hash(seed, i, 3)),
  }));
  const wake = Array.from({ length: 30 }, (_, k) => {
    const u = (k + 0.5) / 30;
    const q = bezier(path, u);
    const jx = (hash(seed, 500 + k, 0) - 0.5) * 4;
    const jy = (hash(seed, 500 + k, 1) - 0.5) * 14;
    return {
      k,
      x: r2(clamp(q.x * 100 + jx, 1, 99)),
      y: r2(clamp(q.y * 100 + jy, 2, 98)),
      r: r2(5 + 9 * hash(seed, 500 + k, 2)),
      o: r2((0.3 + 0.45 * hash(seed, 500 + k, 3)) * (0.45 + 0.55 * u)),
    };
  });
  return { motes, wake };
}

/**
 * Night water full of bioluminescent plankton behind your content. Left
 * alone it is nearly black — faint motes on a slow current, the odd lone
 * flash. Move the pointer through it and the water you push blooms blue-green
 * along your wake about 70 ms after you pass, then fades back to black over
 * `glowDecay`; the hand drags the water too, so the lit points drift apart
 * into a soft V while they fade, and each plankton spends a charge when it
 * flashes, so a second pass over the same patch is dimmer until it recovers.
 * A click sends a ring out from the point, drawn by nothing but the plankton
 * it reaches as they flash. Canvas 2D with additive sprites; the loop runs
 * only while something moves or glows, slowly when only drifting, and never
 * off screen. The keyboard gets a light of its own: arrows move it, stirring
 * a wake, and Enter sends a ring. Under reduced motion the water holds a
 * still, softly glowing wake; disturbances light it in place and fade.
 */
export function PlanktonWake({
  children,
  density = 44,
  glowDecay = 1.4,
  hue = 196,
  water = "oklch(from var(--accent) 0.17 0.035 h)",
  wakeRadius = 44,
  sensitivity = 0.6,
  ring = true,
  ringSpeed = 480,
  ambient = 0.3,
  intro = true,
  interactive = true,
  paused = false,
  seed = 7,
  dpr = 2,
  label = "Dark water",
  onPulse,
  onGlowChange,
  disabled = false,
  className,
}: PlanktonWakeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const live = interactive && !disabled;
  const cfg: Config = {
    density: clamp(density, 0, 200),
    glowDecay,
    hue,
    wakeRadius,
    sensitivity,
    ring,
    ringSpeed,
    ambient,
    intro,
    interactive: live,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const cfgRef = React.useRef(cfg);
  const report = React.useRef<Report>({
    onPulse,
    onGlowChange,
    said: () => {},
  });
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    report.current = {
      onPulse,
      onGlowChange,
      said: (text) => setSaid((s) => ({ n: s.n + 1, text })),
    };
  });

  // The engine is bound to the canvas: built with it, gone with it.
  // StrictMode's rehearsal builds and disposes one, then builds the real one.
  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const e = createWater(root, canvas, report);
    engine.current = e;
    e.configure(cfgRef.current);
    e.resize();
    e.setVisible(visible.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  // Size and sighting, bound to the node when it arrives.
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
    const onVisibility = () =>
      engine.current?.setVisible(visible.current && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
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

  const onChild = (target: EventTarget | null) =>
    target instanceof Element && target.closest(INTERACTIVE) !== null;

  // A swipe on glass stirs; a tap (or a click) sends a ring. The drag itself
  // moves nothing: it only claims the pointer once it travels, so a quick tap
  // stays a tap.
  const drag = useDrag({
    threshold: 6,
    disabled: !live,
    onTap: (event) => {
      if (onChild(event.target)) return;
      const at = local(event.clientX, event.clientY);
      engine.current?.pulse(at.x, at.y);
    },
    onEnd: () => engine.current?.lift(),
    onCancel: () => engine.current?.lift(),
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!live) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.stir(at.x, at.y, event.timeStamp);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const by = event.shiftKey ? 72 : 24;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    engine.current?.keyMove(move[0], move[1]);
  };

  const still = React.useMemo(() => standIn(seed), [seed]);
  const tones = glowTones(hue);

  return (
    <div
      ref={bindRoot}
      {...drag}
      onPointerMove={onPointerMove}
      onPointerLeave={() => engine.current?.lift()}
      className={cn(
        "group/plankton-wake relative isolate h-56 w-full overflow-clip",
        live ? "touch-pan-y" : "touch-auto",
        className,
      )}
      style={{
        backgroundColor: water,
        // Shading is mixed toward white and black in oklab: an oklch mix with
        // black loses the hue and tints the deep water red.
        backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${water} 90%, white) 0%, transparent 42%), radial-gradient(130% 90% at 50% 125%, color-mix(in oklab, ${water} 50%, black) 0%, transparent 72%)`,
      }}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-500 group-data-live/plankton-wake:opacity-0"
      >
        <defs>
          <radialGradient id={`${uid}-glow`}>
            <stop
              offset="0%"
              style={{ stopColor: tones.core }}
              stopOpacity={0.95}
            />
            <stop
              offset="30%"
              style={{ stopColor: tones.mid }}
              stopOpacity={0.5}
            />
            <stop
              offset="65%"
              style={{ stopColor: tones.halo }}
              stopOpacity={0.14}
            />
            <stop
              offset="100%"
              style={{ stopColor: tones.halo }}
              stopOpacity={0}
            />
          </radialGradient>
        </defs>
        {still.motes.map((m) => (
          <circle
            key={m.i}
            cx={`${m.x}%`}
            cy={`${m.y}%`}
            r={m.r}
            opacity={m.o}
            style={{ fill: tones.mid }}
          />
        ))}
        {still.wake.map((b) => (
          <circle
            key={`w${b.k}`}
            cx={`${b.x}%`}
            cy={`${b.y}%`}
            r={b.r}
            fill={`url(#${uid}-glow)`}
            opacity={b.o}
          />
        ))}
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full mix-blend-screen"
      />
      <button
        type="button"
        data-water=""
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={!live}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            engine.current?.keyFocus(true);
          }
        }}
        onBlur={() => engine.current?.keyFocus(false)}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it sends a ring from the keyboard's light.
          if (event.detail === 0 && live) engine.current?.keyPulse();
        }}
        className={cn(
          "absolute inset-0 z-0 size-full cursor-default rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full [&>*]:pointer-events-auto">
        {children}
      </div>
      {live ? (
        <p id={hintId} className="sr-only">
          Arrow keys move a light through the water; Enter or Space sends a
          ring.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
