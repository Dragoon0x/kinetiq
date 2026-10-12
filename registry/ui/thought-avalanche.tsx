"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThoughtAvalanchePhase = "spreading" | "fizzled" | "faded" | "storm";

export type ThoughtAvalancheStats = {
  /** Firings so far in this avalanche (a node that fires twice counts twice). */
  size: number;
  /** Distinct nodes that have fired. */
  reach: number;
  /** The furthest generation reached: the seed is 0, its children 1… */
  generations: number;
  /** Pulses still travelling. */
  active: number;
  /** Still spreading, or how it ended: fizzled out early, spread and faded, or stormed most of the field. */
  phase: ThoughtAvalanchePhase;
};

export type ThoughtAvalancheProps = {
  /** How many neighbours a firing sets off on average, 0.5 (fizzles) to 2 (storms); 1 is critical. @default 1.1 */
  branching?: number;
  /** How long a fired node rests before it can fire again, ms. @default 1600 */
  refractory?: number;
  /** The glow's hue, degrees 0–360. @default 195 */
  hue?: number;
  /** Nodes per 100 × 100 px of field, 2 to 40. @default 14 */
  density?: number;
  /** Each node's nearest neighbours it is joined to, 2 to 8. @default 5 */
  connections?: number;
  /** How fast a pulse runs along a filament, px per second. @default 240 */
  conduction?: number;
  /** How bright the glow is, 0 to 1. @default 0.7 */
  glow?: number;
  /** The first time the field is in view, one avalanche starts by itself (silently). @default true */
  intro?: boolean;
  /** Stray firings a minute while the field is in view, 0 for none. @default 0 */
  spontaneous?: number;
  /** Freeze everything where it is. @default false */
  paused?: boolean;
  /** Seeds the network's layout and the chances. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires as a visitor's avalanche starts, at each new generation, and when it ends. */
  onAvalanche?: (stats: ThoughtAvalancheStats) => void;
  /** The field's accessible name. @default "Thought field" */
  label?: string;
  /** No clicks or keys; the field dims. @default false */
  disabled?: boolean;
  /** Sizes the field; it fills its parent by default. */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A small seeded generator for the chances: the same seed, the same field. */
function prng(seed: number) {
  let s = (Math.imul(seed, 2654435761) ^ 0x5bd1e995) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const palette = (hue: number) => {
  const h = Math.round(((hue % 360) + 360) % 360);
  return {
    h,
    deep: `oklch(0.13 0.02 ${h})`,
    field: `oklch(0.19 0.035 ${h})`,
    thread: `oklch(0.66 0.05 ${h})`,
    node: `oklch(0.74 0.06 ${h})`,
    glow: `oklch(0.84 0.13 ${h})`,
    core: `oklch(0.97 0.04 ${h})`,
    rest: `oklch(0.62 0.1 ${(h + 50) % 360})`,
    ring: `oklch(0.95 0.03 ${h} / 0.85)`,
  };
};

type Palette = ReturnType<typeof palette>;

type Config = {
  branching: number;
  refractory: number;
  hue: number;
  density: number;
  connections: number;
  conduction: number;
  glow: number;
  spontaneous: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

const POOL = 6000;
const FLASH_MS = 900;
const TAIL = 0.24;

type Graph = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  /** Edges: endpoints, the bow's control point, and length. */
  ea: Int32Array;
  eb: Int32Array;
  ex: Float32Array;
  ey: Float32Array;
  elen: Float32Array;
  /** Adjacency in compressed rows: node i's edges are adjEdge[start[i]..start[i+1]). */
  start: Int32Array;
  adjEdge: Int32Array;
};

/** Nodes on a jittered grid and each joined to its nearest neighbours by a bowed filament. */
function buildGraph(w: number, h: number, cfg: Config): Graph {
  const seed = Math.round(cfg.seed);
  const want = clamp(Math.round((cfg.density * w * h) / 10000), 24, 900);
  const cell = Math.sqrt((w * h) / want);
  const cols = Math.max(1, Math.round(w / cell));
  const rows = Math.max(1, Math.round(h / cell));
  const cw = w / cols;
  const ch = h / rows;
  const n = cols * rows;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c;
      x[i] = (c + 0.15 + hash(seed, i * 2) * 0.7) * cw;
      y[i] = (r + 0.15 + hash(seed, i * 2 + 1) * 0.7) * ch;
    }
  }
  const k = clamp(Math.round(cfg.connections), 2, 8);
  const pairs = new Set<number>();
  const list: number[] = [];
  const near: { j: number; d: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const ci = i % cols;
    const ri = Math.floor(i / cols);
    near.length = 0;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const rr = ri + dr;
        const cc = ci + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (j === i) continue;
        const dx = (x[j] ?? 0) - (x[i] ?? 0);
        const dy = (y[j] ?? 0) - (y[i] ?? 0);
        near.push({ j, d: dx * dx + dy * dy });
      }
    }
    near.sort((a, b) => a.d - b.d);
    for (let m = 0; m < Math.min(k, near.length); m += 1) {
      const j = near[m]?.j ?? 0;
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const key = lo * n + hi;
      if (pairs.has(key)) continue;
      pairs.add(key);
      list.push(lo, hi);
    }
  }
  const e = list.length / 2;
  const ea = new Int32Array(e);
  const eb = new Int32Array(e);
  const ex = new Float32Array(e);
  const ey = new Float32Array(e);
  const elen = new Float32Array(e);
  const degree = new Int32Array(n);
  for (let q = 0; q < e; q += 1) {
    const a = list[q * 2] ?? 0;
    const b = list[q * 2 + 1] ?? 0;
    ea[q] = a;
    eb[q] = b;
    const ax = x[a] ?? 0;
    const ay = y[a] ?? 0;
    const bx = x[b] ?? 0;
    const by = y[b] ?? 0;
    const len = Math.hypot(bx - ax, by - ay);
    // A filament is never quite straight.
    const bow = (hash(seed + 101, q) - 0.5) * 0.42 * len;
    const nx = -(by - ay) / (len || 1);
    const ny = (bx - ax) / (len || 1);
    ex[q] = (ax + bx) / 2 + nx * bow;
    ey[q] = (ay + by) / 2 + ny * bow;
    elen[q] = len * (1 + (bow / (len || 1)) ** 2 * 0.6);
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i += 1)
    start[i + 1] = (start[i] ?? 0) + (degree[i] ?? 0);
  const fill = start.slice(0, n);
  const adjEdge = new Int32Array(e * 2);
  for (let q = 0; q < e; q += 1) {
    const a = ea[q] ?? 0;
    const b = eb[q] ?? 0;
    adjEdge[fill[a] ?? 0] = q;
    fill[a] = (fill[a] ?? 0) + 1;
    adjEdge[fill[b] ?? 0] = q;
    fill[b] = (fill[b] ?? 0) + 1;
  }
  return { n, x, y, ea, eb, ex, ey, elen, start, adjEdge };
}

/** A soft round glow, drawn once per hue, stamped for every flash and pulse head. */
function makeSprite(p: Palette): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, p.core);
  g.addColorStop(0.18, p.glow);
  g.addColorStop(0.5, p.glow.replace(")", " / 0.28)"));
  g.addColorStop(1, p.glow.replace(")", " / 0)"));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

/* --------------------------------- engine --------------------------------- */

type Stats = ThoughtAvalancheStats;

type Engine = {
  configure: (cfg: Config) => void;
  hover: (x: number, y: number, on: boolean) => number;
  select: (node: number) => void;
  nearest: (x: number, y: number) => number;
  step: (from: number, dx: number, dy: number) => number;
  centre: () => number;
  seed: (node: number, user: boolean) => void;
  position: (node: number) => { x: number; y: number } | null;
  resize: () => void;
  wake: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  visible: { current: boolean },
  report: (stats: Stats, user: boolean, ended: boolean) => void,
): Engine {
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
  const size = { w: 0, h: 0, dpr: 1 };
  let graph: Graph | null = null;
  let graphKey = "";
  let base: HTMLCanvasElement | null = null;
  let pal: Palette = palette(195);
  let sprite: HTMLCanvasElement | null = null;
  let rand = prng(3);
  // Simulation clock: it stands still while paused or hidden.
  let clock = 0;
  let last = 0;
  const epoch = performance.now();

  // Node state.
  let lastFire = new Float64Array(0);
  let fired = new Uint8Array(0);
  // Edge afterglow.
  let lit = new Float32Array(0);
  // The pulse pool.
  const pEdge = new Int32Array(POOL);
  const pFrom = new Int32Array(POOL);
  const pStart = new Float64Array(POOL);
  const pDur = new Float32Array(POOL);
  const pGen = new Uint16Array(POOL);
  const pAlive = new Uint8Array(POOL);
  let alive = 0;
  let free = 0;

  const stats: Stats = {
    size: 0,
    reach: 0,
    generations: 0,
    active: 0,
    phase: "fizzled",
  };
  let running = false;
  let byUser = false;
  let hovered = -1;
  let selected = -1;
  // The clicked node's ring, on the snap spring's constants.
  const bloom = { node: -1, r: 0, v: 0, a: 0 };
  let spontaneous = 0;

  const build = () => {
    const c = cfg;
    if (!c || size.w < 2 || size.h < 2) return;
    const key = `${size.w}x${size.h}|${c.density}|${c.connections}|${Math.round(c.seed)}`;
    if (key !== graphKey) {
      graphKey = key;
      graph = buildGraph(size.w, size.h, c);
      lastFire = new Float64Array(graph.n).fill(-1e9);
      fired = new Uint8Array(graph.n);
      lit = new Float32Array(graph.ea.length);
      pAlive.fill(0);
      alive = 0;
      running = false;
      hovered = -1;
      if (selected >= graph.n) selected = -1;
      rand = prng(Math.round(c.seed) * 31 + 7);
    }
    paintBase();
  };

  const curve = (g: CanvasRenderingContext2D, e: number, d: number) => {
    const G = graph;
    if (!G) return;
    const a = G.ea[e] ?? 0;
    const b = G.eb[e] ?? 0;
    g.moveTo((G.x[a] ?? 0) * d, (G.y[a] ?? 0) * d);
    g.quadraticCurveTo(
      (G.ex[e] ?? 0) * d,
      (G.ey[e] ?? 0) * d,
      (G.x[b] ?? 0) * d,
      (G.y[b] ?? 0) * d,
    );
  };

  /** The faint network on its dark field, painted once per size and colour. */
  const paintBase = () => {
    const G = graph;
    if (!G) return;
    const d = size.dpr;
    base ??= document.createElement("canvas");
    base.width = canvas.width;
    base.height = canvas.height;
    const g = base.getContext("2d");
    if (!g) return;
    const grd = g.createRadialGradient(
      base.width * 0.5,
      base.height * 0.45,
      0,
      base.width * 0.5,
      base.height * 0.45,
      Math.hypot(base.width, base.height) * 0.6,
    );
    grd.addColorStop(0, pal.field);
    grd.addColorStop(1, pal.deep);
    g.fillStyle = grd;
    g.fillRect(0, 0, base.width, base.height);
    g.strokeStyle = pal.thread;
    g.lineWidth = 0.8 * d;
    g.globalAlpha = 0.2;
    g.beginPath();
    for (let e = 0; e < G.ea.length; e += 1) curve(g, e, d);
    g.stroke();
    g.globalAlpha = 0.6;
    g.fillStyle = pal.node;
    g.beginPath();
    for (let i = 0; i < G.n; i += 1) {
      const px = (G.x[i] ?? 0) * d;
      const py = (G.y[i] ?? 0) * d;
      g.moveTo(px + 1.3 * d, py);
      g.arc(px, py, 1.3 * d, 0, Math.PI * 2);
    }
    g.fill();
    g.globalAlpha = 1;
  };

  const spawn = (e: number, from: number, t: number, gen: number) => {
    const c = cfg;
    const G = graph;
    if (!c || !G || alive >= POOL) return;
    let slot = free;
    for (let k = 0; k < POOL && pAlive[slot]; k += 1) slot = (slot + 1) % POOL;
    if (pAlive[slot]) return;
    pAlive[slot] = 1;
    pEdge[slot] = e;
    pFrom[slot] = from;
    pStart[slot] = t;
    pDur[slot] =
      ((G.elen[e] ?? 10) / Math.max(20, c.conduction)) *
      1000 *
      (0.9 + rand() * 0.2);
    pGen[slot] = gen;
    alive += 1;
    free = (slot + 1) % POOL;
  };

  /** A node fires: unless it is resting, each filament carries a pulse on with the branching chance. */
  const fire = (node: number, t: number, gen: number): boolean => {
    const c = cfg;
    const G = graph;
    if (!c || !G) return false;
    if (t - (lastFire[node] ?? -1e9) < c.refractory) return false;
    lastFire[node] = t;
    const times = (fired[node] ?? 0) + 1;
    fired[node] = Math.min(255, times);
    stats.size += 1;
    if (times === 1) stats.reach += 1;
    if (gen > stats.generations) {
      stats.generations = gen;
      if (byUser)
        report({ ...stats, active: alive, phase: "spreading" }, true, false);
    }
    const s = G.start[node] ?? 0;
    const end = G.start[node + 1] ?? s;
    // The ratio is over the neighbours that could answer: one still resting
    // (often the one that just fired this node) is not asked.
    let avail = 0;
    for (let q = s; q < end; q += 1) {
      const e = G.adjEdge[q] ?? 0;
      const other = (G.ea[e] ?? 0) === node ? (G.eb[e] ?? 0) : (G.ea[e] ?? 0);
      if (t - (lastFire[other] ?? -1e9) >= c.refractory) avail += 1;
    }
    if (avail === 0) return true;
    // Within one avalanche a node tires: each further firing passes on half as much.
    const p = (clamp(c.branching, 0, 4) / avail) * Math.pow(0.5, times - 1);
    let passed = 0;
    let pick = Math.floor(rand() * avail);
    let fallback = -1;
    for (let q = s; q < end; q += 1) {
      const e = G.adjEdge[q] ?? 0;
      const other = (G.ea[e] ?? 0) === node ? (G.eb[e] ?? 0) : (G.ea[e] ?? 0);
      if (t - (lastFire[other] ?? -1e9) < c.refractory) continue;
      if (pick === 0) fallback = e;
      pick -= 1;
      if (rand() < p) {
        spawn(e, node, t, gen + 1);
        passed += 1;
      }
    }
    // A seeded thought always reaches at least one neighbour; from there on
    // it is the branching ratio's to keep or lose.
    if (gen === 0 && passed === 0 && fallback >= 0) spawn(fallback, node, t, 1);
    return true;
  };

  const finish = () => {
    const G = graph;
    if (!running || !G) return;
    running = false;
    stats.phase =
      stats.reach >= G.n * 0.5
        ? "storm"
        : stats.reach >= Math.max(6, G.n * 0.08)
          ? "faded"
          : "fizzled";
    stats.active = 0;
    report({ ...stats }, byUser, true);
  };

  /** Advance the simulation to `t`: pulses that arrive fire their nodes, in order. */
  const advance = (t: number) => {
    const G = graph;
    if (!G) return;
    // Arrivals can spawn pulses that also arrive before t; loop until settled.
    for (let guard = 0; guard < 64; guard += 1) {
      let any = false;
      for (let k = 0; k < POOL; k += 1) {
        if (!pAlive[k]) continue;
        const end = (pStart[k] ?? 0) + (pDur[k] ?? 0);
        if (end > t) continue;
        pAlive[k] = 0;
        alive -= 1;
        any = true;
        const e = pEdge[k] ?? 0;
        const from = pFrom[k] ?? 0;
        const to = (G.ea[e] ?? 0) === from ? (G.eb[e] ?? 0) : (G.ea[e] ?? 0);
        lit[e] = 1;
        fire(to, end, pGen[k] ?? 0);
      }
      if (!any) break;
    }
    stats.active = alive;
    if (running && alive === 0) finish();
  };

  const draw = (dtMs: number) => {
    const c = cfg;
    const G = graph;
    if (!ctx || !c || !G || !base) return;
    const d = size.dpr;
    const t = clock;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(base, 0, 0);
    const gl = clamp(c.glow, 0, 1);
    ctx.globalCompositeOperation = "lighter";
    // Afterglow on the filaments pulses have crossed.
    const fade = Math.exp(-dtMs / 650);
    ctx.strokeStyle = pal.glow;
    ctx.lineWidth = 1.1 * d;
    for (let e = 0; e < lit.length; e += 1) {
      const v = lit[e] ?? 0;
      if (v < 0.02) {
        if (v) lit[e] = 0;
        continue;
      }
      ctx.globalAlpha = v * (0.25 + 0.4 * gl);
      ctx.beginPath();
      curve(ctx, e, d);
      ctx.stroke();
      lit[e] = v * fade;
    }
    // Pulses: a bright head with a short tail along the bowed filament.
    ctx.lineWidth = 1.8 * d;
    ctx.strokeStyle = pal.core;
    const spr = sprite;
    for (let k = 0; k < POOL; k += 1) {
      if (!pAlive[k]) continue;
      const e = pEdge[k] ?? 0;
      const from = pFrom[k] ?? 0;
      const fwd = (G.ea[e] ?? 0) === from;
      const u = clamp((t - (pStart[k] ?? 0)) / Math.max(1, pDur[k] ?? 1), 0, 1);
      const u0 = Math.max(0, u - TAIL);
      // The edge's own direction: a pulse from b runs the curve backwards.
      const s0 = fwd ? u0 : 1 - u;
      const s1 = fwd ? u : 1 - u0;
      const ax = G.x[G.ea[e] ?? 0] ?? 0;
      const ay = G.y[G.ea[e] ?? 0] ?? 0;
      const bx = G.x[G.eb[e] ?? 0] ?? 0;
      const by = G.y[G.eb[e] ?? 0] ?? 0;
      const cx = G.ex[e] ?? 0;
      const cy = G.ey[e] ?? 0;
      // The sub-curve between s0 and s1 (blossoming the quadratic).
      const q = (s: number, a: number, m: number, b: number) =>
        (1 - s) * (1 - s) * a + 2 * (1 - s) * s * m + s * s * b;
      const mid = (sa: number, sb: number, a: number, m: number, b: number) =>
        (1 - sa) * (1 - sb) * a +
        ((1 - sa) * sb + sa * (1 - sb)) * m +
        sa * sb * b;
      ctx.globalAlpha = 0.55 + 0.4 * gl;
      ctx.beginPath();
      ctx.moveTo(q(s0, ax, cx, bx) * d, q(s0, ay, cy, by) * d);
      ctx.quadraticCurveTo(
        mid(s0, s1, ax, cx, bx) * d,
        mid(s0, s1, ay, cy, by) * d,
        q(s1, ax, cx, bx) * d,
        q(s1, ay, cy, by) * d,
      );
      ctx.stroke();
      if (spr) {
        const hu = fwd ? u : 1 - u;
        const hx = q(hu, ax, cx, bx) * d;
        const hy = q(hu, ay, cy, by) * d;
        const r = 7 * d;
        ctx.globalAlpha = 0.5 + 0.4 * gl;
        ctx.drawImage(spr, hx - r, hy - r, r * 2, r * 2);
      }
    }
    // Flashes on nodes that just fired; a dim tint on those still resting.
    // (Under reduced motion the still map on the overlay says it instead.)
    for (let i = 0; c.motionSafe && i < G.n; i += 1) {
      const since = t - (lastFire[i] ?? -1e9);
      if (since < 0 || since > c.refractory + 50) continue;
      const px = (G.x[i] ?? 0) * d;
      const py = (G.y[i] ?? 0) * d;
      if (since < FLASH_MS && spr) {
        const f = Math.exp(-since / 230);
        const r = (5 + 13 * f) * d;
        ctx.globalAlpha = f * (0.5 + 0.5 * gl);
        ctx.drawImage(spr, px - r, py - r, r * 2, r * 2);
      }
      const rest = 1 - since / Math.max(1, c.refractory);
      if (rest > 0) {
        ctx.globalAlpha = 0.45 * rest;
        ctx.fillStyle = pal.rest;
        ctx.beginPath();
        ctx.arc(px, py, 2 * d, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    // The clicked node's ring and the hover / keyboard selection ring.
    if (bloom.node >= 0 && bloom.a > 0.01) {
      ctx.globalAlpha = bloom.a;
      ctx.strokeStyle = pal.ring;
      ctx.lineWidth = 1.5 * d;
      ctx.beginPath();
      ctx.arc(
        (G.x[bloom.node] ?? 0) * d,
        (G.y[bloom.node] ?? 0) * d,
        Math.max(0, bloom.r) * d,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    const ringAt = selected >= 0 ? selected : hovered;
    if (ringAt >= 0) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = pal.ring;
      ctx.lineWidth = 1.25 * d;
      ctx.beginPath();
      ctx.arc(
        (G.x[ringAt] ?? 0) * d,
        (G.y[ringAt] ?? 0) * d,
        6.5 * d,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const busy = () => {
    const c = cfg;
    if (!c || c.paused) return false;
    if (alive > 0 || bloom.a > 0.01) return true;
    for (let e = 0; e < lit.length; e += 1)
      if ((lit[e] ?? 0) >= 0.02) return true;
    const G = graph;
    if (G) {
      for (let i = 0; i < G.n; i += 1) {
        if (clock - (lastFire[i] ?? -1e9) < c.refractory + 50) return true;
      }
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
    const dt = last ? Math.min(50, now - last) : 16;
    last = now;
    if (!c.paused) {
      clock += dt;
      advance(clock);
      if (bloom.node >= 0) {
        // The ring's radius rides the snap spring toward its rest; it fades as it goes.
        const k = springs.snap.stiffness;
        const damp = springs.snap.damping;
        const h = dt / 1000;
        bloom.v += (k * (22 - bloom.r) - damp * bloom.v) * h;
        bloom.r += bloom.v * h;
        bloom.a *= Math.exp(-h * 4.2);
      }
    }
    draw(c.paused ? 0 : dt);
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the whole cascade resolves at once and is drawn as a still map that fades. */
  const resolveNow = (seedNode: number) => {
    const G = graph;
    if (!G) return;
    for (let guard = 0; guard < 400 && alive > 0; guard += 1) {
      let next = Infinity;
      for (let k = 0; k < POOL; k += 1) {
        if (pAlive[k]) next = Math.min(next, (pStart[k] ?? 0) + (pDur[k] ?? 0));
      }
      if (!Number.isFinite(next)) break;
      clock = Math.max(clock, next);
      advance(clock);
    }
    const g = overlay.getContext("2d");
    if (!g || !ctx) return;
    overlay.width = canvas.width;
    overlay.height = canvas.height;
    const d = size.dpr;
    g.clearRect(0, 0, overlay.width, overlay.height);
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = pal.glow;
    g.lineWidth = 1.2 * d;
    g.globalAlpha = 0.55;
    g.beginPath();
    for (let e = 0; e < lit.length; e += 1) {
      if ((lit[e] ?? 0) > 0) curve(g, e, d);
    }
    g.stroke();
    if (sprite) {
      for (let i = 0; i < G.n; i += 1) {
        if (!fired[i] && i !== seedNode) continue;
        const r = (i === seedNode ? 14 : 8) * d;
        g.globalAlpha = i === seedNode ? 1 : 0.7;
        g.drawImage(
          sprite,
          (G.x[i] ?? 0) * d - r,
          (G.y[i] ?? 0) * d - r,
          r * 2,
          r * 2,
        );
      }
    }
    lit.fill(0);
    // The map holds, then fades on a CSS opacity transition.
    overlay.style.transition = "none";
    overlay.style.opacity = "1";
    void overlay.getBoundingClientRect();
    overlay.style.transition = "opacity 2.4s ease-in 0.9s";
    overlay.style.opacity = "0";
    draw(0);
  };

  const scheduleStray = () => {
    window.clearTimeout(spontaneous);
    const c = cfg;
    if (!c || c.spontaneous <= 0 || disposed) return;
    const wait = (-Math.log(1 - rand()) * 60000) / c.spontaneous;
    spontaneous = window.setTimeout(
      () => {
        const G = graph;
        if (G && visible.current && !document.hidden && cfg && !cfg.paused) {
          seedNode(Math.floor(rand() * G.n), false);
        }
        scheduleStray();
      },
      Math.min(120000, Math.max(200, wait)),
    );
  };

  const seedNode = (node: number, user: boolean) => {
    const c = cfg;
    const G = graph;
    if (!c || !G || node < 0 || node >= G.n) return;
    // Nothing ticks under reduced motion, so rests are timed by the wall clock.
    if (!c.motionSafe) clock = Math.max(clock, performance.now() - epoch);
    if (!running) {
      running = true;
      byUser = user;
      fired.fill(0);
      stats.size = 0;
      stats.reach = 0;
      stats.generations = 0;
      stats.active = 0;
      stats.phase = "spreading";
    } else if (user) {
      byUser = true;
    }
    const ok = fire(node, clock, 0);
    if (!ok && stats.size === 0) {
      // The node is still resting: nothing starts.
      running = false;
      if (user) report({ ...stats, active: 0, phase: "fizzled" }, true, true);
      if (!frame) draw(0);
      return;
    }
    if (ok && user)
      report({ ...stats, active: alive, phase: "spreading" }, true, false);
    if (c.motionSafe) {
      bloom.node = node;
      bloom.r = 4;
      bloom.v = 0;
      bloom.a = 1;
      kick();
    } else {
      resolveNow(node);
      if (running && alive === 0) finish();
    }
  };

  const nearest = (x: number, y: number) => {
    const G = graph;
    if (!G) return -1;
    let best = Infinity;
    let found = -1;
    for (let i = 0; i < G.n; i += 1) {
      const dx = (G.x[i] ?? 0) - x;
      const dy = (G.y[i] ?? 0) - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) {
        best = d2;
        found = i;
      }
    }
    return found;
  };

  const resize = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!c || w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx = canvas.getContext("2d");
    build();
    draw(0);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.hue !== next.hue) {
        pal = palette(next.hue);
        sprite = makeSprite(pal);
      }
      if (!was || was.dpr !== next.dpr) resize();
      else build();
      if (!was || was.spontaneous !== next.spontaneous) scheduleStray();
      draw(0);
      kick();
    },
    hover(x, y, on) {
      const G = graph;
      let found = -1;
      if (on && G) {
        let best = 36 * 36;
        for (let i = 0; i < G.n; i += 1) {
          const dx = (G.x[i] ?? 0) - x;
          const dy = (G.y[i] ?? 0) - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            found = i;
          }
        }
      }
      if (found !== hovered) {
        hovered = found;
        if (!frame) draw(0);
      }
      return found;
    },
    select(node) {
      selected = node;
      if (!frame) draw(0);
    },
    nearest,
    step(from, dx, dy) {
      const G = graph;
      if (!G || from < 0) return from;
      const ox = G.x[from] ?? 0;
      const oy = G.y[from] ?? 0;
      let best = Infinity;
      let found = from;
      for (let i = 0; i < G.n; i += 1) {
        if (i === from) continue;
        const vx = (G.x[i] ?? 0) - ox;
        const vy = (G.y[i] ?? 0) - oy;
        const along = vx * dx + vy * dy;
        if (along <= 1) continue;
        const across = Math.abs(vx * dy - vy * dx);
        // Prefer the nearest node within a cone around the arrow's direction.
        if (across > along * 1.4) continue;
        const score = along + across * 2.2;
        if (score < best) {
          best = score;
          found = i;
        }
      }
      return found;
    },
    centre: () => nearest(size.w / 2, size.h / 2),
    seed: seedNode,
    position(node) {
      const G = graph;
      if (!G || node < 0 || node >= G.n) return null;
      return { x: G.x[node] ?? 0, y: G.y[node] ?? 0 };
    },
    resize,
    wake() {
      draw(0);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(spontaneous);
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component ------------------------------- */

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * A dark field of a few hundred nodes joined by faint, slightly bowed
 * filaments. Clicking fires the nearest node; a firing sends a glowing pulse
 * down each of its filaments with the chance `branching / degree`, so on
 * average it sets off `branching` neighbours. Pulses run at `conduction`
 * px/s, and a pulse that arrives fires its node unless the node is still
 * resting from its last firing (`refractory`). Under 1 the cascade fizzles
 * after a few branches; near 1 it is critical, with sizes from a handful to
 * most of the field; over 1 it storms across the whole field. Within one
 * avalanche a node tires — each further firing passes on half as much — so
 * even a storm ends.
 *
 * Canvas 2D: the faint network is painted once; each frame draws only the
 * filaments' afterglow, the pulse heads with their short tails along the
 * curve, the flashes of fired nodes and the dim tint of resting ones, and a
 * ring that blooms on the clicked node on the springs.snap constants. Arrow
 * keys move a selection ring between nodes and Enter fires it. Under reduced
 * motion nothing travels: a firing resolves the whole cascade at once and its
 * map fades away.
 */
export function ThoughtAvalanche({
  branching = 1.1,
  refractory = 1600,
  hue = 195,
  density = 14,
  connections = 5,
  conduction = 240,
  glow = 0.7,
  intro = true,
  spontaneous = 0,
  paused = false,
  seed = 3,
  dpr = 2,
  onAvalanche,
  label = "Thought field",
  disabled = false,
  className,
}: ThoughtAvalancheProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLCanvasElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const introDone = React.useRef(false);
  const introOn = React.useRef(intro);
  const selected = React.useRef(-1);
  const [said, setSaid] = React.useState("");
  const onAvalancheRef = React.useRef(onAvalanche);

  React.useEffect(() => {
    onAvalancheRef.current = onAvalanche;
    introOn.current = intro;
  });

  const config: Config = {
    branching,
    refractory: clamp(refractory, 50, 20000),
    hue,
    density: clamp(density, 2, 40),
    connections,
    conduction,
    glow,
    spontaneous: Math.max(0, spontaneous),
    paused,
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
    const overlay = overlayRef.current;
    if (!root || !canvas || !overlay) return;
    const e = createEngine(
      root,
      canvas,
      overlay,
      visible,
      (stats, user, ended) => {
        if (!user) return;
        onAvalancheRef.current?.(stats);
        if (ended && stats.size === 0) {
          setSaid("That thought is still resting.");
        } else if (ended) {
          setSaid(
            `${plural(stats.size, "thought", "thoughts")} over ${plural(stats.generations, "step", "steps")}, ${
              stats.phase === "storm"
                ? "a storm across the field"
                : stats.phase === "faded"
                  ? "spread and faded"
                  : "fizzled out"
            }.`,
          );
        }
      },
    );
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

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    let wait = 0;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver(
      (entries) => {
        visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
        if (!visible.current) return;
        engine.current?.wake();
        if (introDone.current || !introOn.current) return;
        // One avalanche of its own the first time it is seen, so the field
        // shows what it does; it is silent and reports nothing.
        window.clearTimeout(wait);
        wait = window.setTimeout(() => {
          const e = engine.current;
          if (!e || introDone.current || !visible.current) return;
          introDone.current = true;
          const r = node.getBoundingClientRect();
          e.seed(e.nearest(r.width * 0.32, r.height * 0.5), false);
        }, 700);
      },
      { threshold: 0.4 },
    );
    watcher.observe(node);
    return () => {
      window.clearTimeout(wait);
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (event: { clientX: number; clientY: number }) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r
      ? { x: event.clientX - r.left, y: event.clientY - r.top }
      : { x: 0, y: 0 };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const e = engine.current;
    if (disabled || !e) return;
    let at = selected.current;
    if (at < 0) at = e.centre();
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[event.key];
    if (dir) {
      event.preventDefault();
      at = selected.current < 0 ? at : e.step(at, dir[0], dir[1]);
    } else if (event.key === "Home") {
      event.preventDefault();
      at = e.centre();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      selected.current = at;
      e.select(at);
      introDone.current = true;
      e.seed(at, true);
      return;
    } else {
      return;
    }
    selected.current = at;
    e.select(at);
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="thought field"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        const e = engine.current;
        if (!e || selected.current >= 0) return;
        // Only a keyboard focus shows the selection ring.
        if (!event.currentTarget.matches(":focus-visible")) return;
        selected.current = e.centre();
        e.select(selected.current);
      }}
      onBlur={() => {
        selected.current = -1;
        engine.current?.select(-1);
      }}
      onPointerMove={(event) => {
        if (disabled || event.pointerType === "touch") return;
        const p = local(event);
        engine.current?.hover(p.x, p.y, true);
      }}
      onPointerLeave={() => engine.current?.hover(0, 0, false)}
      onClick={(event) => {
        const e = engine.current;
        if (disabled || !e || event.detail === 0) return;
        const p = local(event);
        introDone.current = true;
        e.seed(e.nearest(p.x, p.y), true);
      }}
      className={cn(
        "group/thought-avalanche relative isolate h-full w-full touch-manipulation overflow-clip rounded-3 select-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ backgroundColor: palette(hue).deep }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(120% 140% at 50% 45%, ${palette(hue).field}, ${palette(hue).deep})`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <canvas
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0"
      />
      <p id={hintId} className="sr-only">
        A network of thoughts. Click a node, or move the selection with the
        arrow keys and press Enter, to fire it; each firing may set off its
        neighbours, and the avalanche spreads until it fizzles out or storms
        across the field. Branching ratio {r1(branching)}.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
