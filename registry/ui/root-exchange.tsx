"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RootExchangeNode = {
  /** Stable id: reversal and focus are keyed by it. */
  id: string;
  /** What the node is called, shown in its tag and its accessible name. */
  label: string;
  /** Its draw on the hub; its share of the total sets its pulse rate. */
  value: number;
};

export type RootExchangePalette = "cobalt" | "signal" | "amber" | "ink";

export type RootExchangeColors = {
  /** The root paths at rest. */
  route?: string;
  /** The pulses and the lit route. */
  pulse?: string;
  /** The hub's core. */
  hub?: string;
};

export type RootExchangeProps = {
  /** The nodes the hub feeds. @default defaultRootNodes */
  nodes?: RootExchangeNode[];
  /** What the hub is, for its accessible name. @default "Hub" */
  hubLabel?: string;
  /** Prints a node's value in its tag and name. @default en-US grouping */
  format?: (value: number) => string;
  /** Controlled: ids of the nodes whose flow runs back to the hub. */
  reversed?: string[];
  /** Ids reversed at first, when uncontrolled. @default [] */
  defaultReversed?: string[];
  /** Fires from the press that reversed (or restored) a node, with the new ids. */
  onReversedChange?: (ids: string[]) => void;
  /** Fires when hover or keyboard focus brings a node forward, or lets it go (null). */
  onActiveChange?: (id: string | null) => void;
  /** Pulses a second leaving the hub in all, shared out by value. @default 4 */
  pulseRate?: number;
  /** Time for a pulse to cross an average route, ms. @default 1800 */
  travel?: number;
  /** How far the roots wander off a straight line, 0 (schematic) to 1 (gnarled). @default 0.55 */
  curve?: number;
  /** How many hair-fine side rootlets the routes shed, 0 to 1. @default 0.5 */
  rootlets?: number;
  /** The colourway, from the theme's tokens. @default "cobalt" */
  palette?: RootExchangePalette;
  /** CSS colours that replace parts of `palette`. */
  colors?: RootExchangeColors;
  /** Seeds where the nodes sit and how the roots wander. @default 7 */
  seed?: number;
  /** Freezes the pulses where they are. @default false */
  paused?: boolean;
  /** Cap on the pulse canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The node group's accessible name. @default "Flow from the hub" */
  label?: string;
  /** Nodes cannot be focused or reversed; the flow still runs. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

export const defaultRootNodes: RootExchangeNode[] = [
  { id: "harbour", label: "Harbour", value: 1640 },
  { id: "ridge", label: "Ridge", value: 420 },
  { id: "mill", label: "Mill Lane", value: 980 },
  { id: "orchard", label: "Orchard", value: 760 },
  { id: "quarry", label: "Quarry", value: 310 },
  { id: "ferry", label: "Ferry Row", value: 1210 },
  { id: "kiln", label: "Kiln Hill", value: 990 },
];

const PALETTES: Record<RootExchangePalette, Required<RootExchangeColors>> = {
  cobalt: {
    route: "color-mix(in oklab, var(--accent-bright) 46%, var(--ink-3))",
    pulse: "var(--accent-bright)",
    hub: "var(--accent)",
  },
  signal: {
    route: "color-mix(in oklab, var(--signal) 44%, var(--ink-3))",
    pulse: "var(--signal)",
    hub: "var(--signal)",
  },
  amber: {
    route: "color-mix(in oklab, var(--warn) 46%, var(--ink-3))",
    pulse: "oklch(from var(--warn) 0.78 0.16 h)",
    hub: "oklch(from var(--warn) 0.72 0.16 h)",
  },
  ink: {
    route: "var(--ink-3)",
    pulse: "var(--ink)",
    hub: "var(--ink-2)",
  },
};

const NUMBER = new Intl.NumberFormat("en-US");
const defaultFormat = (value: number) => NUMBER.format(value);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct3 = (v: number) => `${Number((v * 100).toFixed(3))}%`;

/** A seeded unit float: the same numbers on the server and in the browser. */
function hash(seed: number, i: number, k: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ Math.imul(k + 7, 2246822519), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

type Pt = { x: number; y: number };

/**
 * Anchor points from a to b that wander off the straight line: two seeded
 * sines under an envelope that is zero at both ends, so a route always leaves
 * and arrives where it should, however gnarled the middle.
 */
function wander(a: Pt, b: Pt, amp: number, seed: number, key: number): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const f1 = 0.6 + hash(seed, key, 1) * 0.7;
  const f2 = 1.6 + hash(seed, key, 2) * 1.2;
  const p1 = hash(seed, key, 3);
  const p2 = hash(seed, key, 4);
  const out: Pt[] = [a];
  const K = 5;
  for (let k = 1; k <= K; k += 1) {
    const t = k / (K + 1);
    const env = Math.pow(Math.sin(Math.PI * t), 0.8);
    const n =
      0.65 * Math.sin(2 * Math.PI * (f1 * t + p1)) +
      0.35 * Math.sin(2 * Math.PI * (f2 * t + p2));
    const off = amp * len * env * n;
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  out.push(b);
  return out;
}

/** Catmull-Rom through the anchors, as cubic segments [p0, c1, c2, p1]. */
function cubics(points: Pt[]): [Pt, Pt, Pt, Pt][] {
  const out: [Pt, Pt, Pt, Pt][] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    out.push([
      p1,
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    ]);
  }
  return out;
}

const f2 = (p: Pt) => `${r2(p.x)} ${r2(p.y)}`;

function pathOf(segs: [Pt, Pt, Pt, Pt][]): string {
  const first = segs[0];
  if (!first) return "";
  return [
    `M ${f2(first[0])}`,
    ...segs.map((s) => `C ${f2(s[1])} ${f2(s[2])} ${f2(s[3])}`),
  ].join(" ");
}

function sampleCubics(segs: [Pt, Pt, Pt, Pt][], per: number): Pt[] {
  const out: Pt[] = [];
  segs.forEach(([p0, c1, c2, p1], i) => {
    for (let k = i === 0 ? 0 : 1; k <= per; k += 1) {
      const t = k / per;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push({
        x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
        y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
      });
    }
  });
  return out;
}

type Route = {
  xs: Float32Array;
  ys: Float32Array;
  cum: Float32Array;
  length: number;
};

type LaidNode = RootExchangeNode & {
  index: number;
  share: number;
  x: number;
  y: number;
  r: number;
};

type Strand = { d: string; width: number; members: number[] };

type Layout = {
  w: number;
  h: number;
  hub: { x: number; y: number; r: number };
  nodes: LaidNode[];
  total: number;
  trunks: Strand[];
  branches: Strand[];
  hairs: Strand[];
  routes: Route[];
  chevrons: { x: number; y: number; deg: number }[];
  beads: { x: number; y: number; s: number }[][];
  /** Node indices in ring order, for the arrow keys. */
  order: number[];
};

function pointAt(route: Route, s: number): Pt {
  const target = clamp(s, 0, 1) * route.length;
  const { cum, xs, ys } = route;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) < target) lo = mid;
    else hi = mid;
  }
  const c0 = cum[lo] ?? 0;
  const c1 = cum[hi] ?? c0;
  const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
  return {
    x: (xs[lo] ?? 0) + ((xs[hi] ?? 0) - (xs[lo] ?? 0)) * t,
    y: (ys[lo] ?? 0) + ((ys[hi] ?? 0) - (ys[lo] ?? 0)) * t,
  };
}

/**
 * The whole system for a box: nodes spaced evenly by arc length round an
 * ellipse (so a wide box spreads them along its long sides), neighbours paired
 * onto shared trunks that fork half way, each trunk as thick as the flow it
 * carries (the cube root of the sum of its branches' cubes, the way roots and
 * rivers taper), rootlets shed along the way. Pure and seeded.
 */
function buildLayout(
  input: RootExchangeNode[],
  w: number,
  h: number,
  curve: number,
  rootlets: number,
  seed: number,
): Layout {
  const total = input.reduce((sum, n) => sum + Math.max(0, n.value), 0);
  const n = input.length;
  const small = Math.min(w, h);
  const scale = clamp(small / 232, 0.72, 1.1);
  const hub = { x: w / 2, y: h / 2, r: r2(clamp(small * 0.06, 9, 16)) };
  const share = (v: number) => (total > 0 ? Math.max(0, v) / total : 0);
  const radiusOf = (s: number) => (5 + 9 * Math.sqrt(s)) * scale;
  const rMax = input.reduce(
    (m, node) => Math.max(m, radiusOf(share(node.value))),
    6,
  );
  const pad = 12;
  const rx = Math.max(24, w / 2 - pad - rMax);
  const ry = Math.max(24, h / 2 - pad - rMax);

  // The ellipse by arc length.
  const N = 256;
  const ring: Pt[] = [];
  const ringCum: number[] = [0];
  for (let i = 0; i <= N; i += 1) {
    const t = (i / N) * Math.PI * 2;
    ring.push({ x: Math.cos(t) * rx, y: Math.sin(t) * ry });
    if (i > 0) {
      const a = ring[i - 1];
      const b = ring[i];
      ringCum.push(
        (ringCum[i - 1] ?? 0) + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0),
      );
    }
  }
  const perimeter = ringCum[N] ?? 1;
  const onRing = (along: number): Pt => {
    const target = ((along % perimeter) + perimeter) % perimeter;
    let i = 1;
    while (i < N && (ringCum[i] ?? 0) < target) i += 1;
    const c0 = ringCum[i - 1] ?? 0;
    const c1 = ringCum[i] ?? c0;
    const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    const a = ring[i - 1] ?? { x: rx, y: 0 };
    const b = ring[i] ?? a;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  const spacing = perimeter / Math.max(1, n);
  const start = hash(seed, 1, 0) * spacing;
  const nodes: LaidNode[] = input.map((node, index) => {
    const along =
      start + spacing * index + (hash(seed, index, 11) - 0.5) * spacing * 0.4;
    const p = onRing(along);
    const reach = 0.86 + hash(seed, index, 12) * 0.14;
    const s = share(node.value);
    return {
      ...node,
      index,
      share: s,
      x: r2(hub.x + p.x * reach),
      y: r2(hub.y + p.y * reach),
      r: r2(radiusOf(s)),
    };
  });

  // Neighbours share a trunk; a lone node at the end gets its own.
  const groups: number[][] = [];
  const shift = n > 3 ? Math.floor(hash(seed, 2, 0) * n) : 0;
  const ringOrder = nodes.map((_, i) => (i + shift) % n);
  if (n <= 3) ringOrder.forEach((i) => groups.push([i]));
  else {
    for (let k = 0; k < ringOrder.length; k += 2) {
      const a = ringOrder[k];
      const b = ringOrder[k + 1];
      if (a === undefined) continue;
      groups.push(b === undefined ? [a] : [a, b]);
    }
  }

  const amp = clamp(curve, 0, 1) * 0.16;
  const widthOf = (s: number) => 0.7 + 2.4 * Math.sqrt(s);
  const trunks: Strand[] = [];
  const branches: Strand[] = [];
  const hairs: Strand[] = [];
  const routePoints: Pt[][] = nodes.map(() => []);
  const hairDensity = clamp(rootlets, 0, 1);

  const shed = (samples: Pt[], members: number[], key: number) => {
    if (samples.length < 6 || hairDensity <= 0) return;
    let len = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const count = Math.round(hairDensity * 3 * (len / 140));
    for (let k = 0; k < count; k += 1) {
      const at = Math.floor(
        samples.length * (0.18 + 0.64 * hash(seed, key * 31 + k, 21)),
      );
      const p = samples[at];
      const q = samples[Math.min(samples.length - 1, at + 2)];
      const o = samples[Math.max(0, at - 2)];
      if (!p || !q || !o) continue;
      const tang = Math.atan2(q.y - o.y, q.x - o.x);
      const side = hash(seed, key * 31 + k, 22) < 0.5 ? -1 : 1;
      const turn = side * (0.55 + 0.45 * hash(seed, key * 31 + k, 23));
      const hl =
        (14 + 22 * hash(seed, key * 31 + k, 24)) *
        (0.6 + 0.5 * hairDensity) *
        scale;
      // A rootlet leaves at a shallow angle and bends away as it goes.
      const a1 = tang + turn * 0.7;
      const a2 = tang + turn * 1.6;
      const c = {
        x: p.x + Math.cos(a1) * hl * 0.55,
        y: p.y + Math.sin(a1) * hl * 0.55,
      };
      const e = {
        x: c.x + Math.cos(a2) * hl * 0.5,
        y: c.y + Math.sin(a2) * hl * 0.5,
      };
      hairs.push({
        d: `M ${f2(p)} Q ${f2(c)} ${f2(e)}`,
        width: 0.6,
        members,
      });
    }
  };

  groups.forEach((group, g) => {
    const mean = group.reduce(
      (m, i) => {
        const node = nodes[i];
        return node ? { x: m.x + node.x, y: m.y + node.y } : m;
      },
      { x: 0, y: 0 },
    );
    const mid = { x: mean.x / group.length, y: mean.y / group.length };
    const lone = group.length === 1;
    const fork = lone
      ? null
      : {
          x: hub.x + (mid.x - hub.x) * 0.5,
          y: hub.y + (mid.y - hub.y) * 0.5,
        };
    const toward = fork ?? mid;
    const dir = Math.atan2(toward.y - hub.y, toward.x - hub.x);
    const from = {
      x: hub.x + Math.cos(dir) * hub.r,
      y: hub.y + Math.sin(dir) * hub.r,
    };
    const groupWidth = Math.cbrt(
      group.reduce(
        (sum, i) => sum + Math.pow(widthOf(nodes[i]?.share ?? 0), 3),
        0,
      ),
    );
    const endOf = (node: LaidNode, origin: Pt): Pt => {
      const a = Math.atan2(node.y - origin.y, node.x - origin.x);
      return {
        x: node.x - Math.cos(a) * node.r,
        y: node.y - Math.sin(a) * node.r,
      };
    };
    if (lone || !fork) {
      const node = nodes[group[0] ?? 0];
      if (!node) return;
      const segs = cubics(wander(from, endOf(node, hub), amp, seed, 100 + g));
      trunks.push({ d: pathOf(segs), width: r2(groupWidth), members: group });
      const samples = sampleCubics(segs, 10);
      routePoints[node.index] = samples;
      shed(samples, group, 100 + g);
      return;
    }
    const trunkSegs = cubics(wander(from, fork, amp, seed, 200 + g));
    trunks.push({
      d: pathOf(trunkSegs),
      width: r2(groupWidth),
      members: group,
    });
    const trunkSamples = sampleCubics(trunkSegs, 10);
    shed(trunkSamples, group, 200 + g);
    group.forEach((i, b) => {
      const node = nodes[i];
      if (!node) return;
      const segs = cubics(
        wander(fork, endOf(node, fork), amp * 1.15, seed, 300 + g * 7 + b),
      );
      branches.push({
        d: pathOf(segs),
        width: r2(widthOf(node.share)),
        members: [i],
      });
      const samples = sampleCubics(segs, 10);
      routePoints[i] = [...trunkSamples, ...samples.slice(1)];
      shed(samples, [i], 300 + g * 7 + b);
    });
  });

  const routes: Route[] = routePoints.map((pts) => {
    const xs = new Float32Array(pts.length);
    const ys = new Float32Array(pts.length);
    const cum = new Float32Array(pts.length);
    let length = 0;
    pts.forEach((p, i) => {
      xs[i] = p.x;
      ys[i] = p.y;
      if (i > 0) {
        const prev = pts[i - 1];
        if (prev) length += Math.hypot(p.x - prev.x, p.y - prev.y);
      }
      cum[i] = length;
    });
    return { xs, ys, cum, length: Math.max(1, length) };
  });

  const chevrons = routes.map((route) => {
    const a = pointAt(route, 0.6);
    const b = pointAt(route, 0.64);
    return {
      x: r2(a.x),
      y: r2(a.y),
      deg: r2((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI),
    };
  });

  const beads = routes.map((route, i) => {
    const count = 1 + Math.round((nodes[i]?.share ?? 0) * 14);
    return Array.from({ length: count }, (_, k) => {
      const s = 0.06 + ((k + 0.5) / count) * 0.84;
      const p = pointAt(route, s);
      return { x: r2(p.x), y: r2(p.y), s: r2(s) };
    });
  });

  const order = [...nodes]
    .sort(
      (a, b) =>
        Math.atan2(a.y - hub.y, a.x - hub.x) -
        Math.atan2(b.y - hub.y, b.x - hub.x),
    )
    .map((node) => node.index);

  return {
    w,
    h,
    hub,
    nodes,
    total,
    trunks,
    branches,
    hairs,
    routes,
    chevrons,
    beads,
    order,
  };
}

/** Any CSS colour as 0–255 rgb, through a 1×1 canvas. */
function colourReader() {
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

type FlowConfig = {
  pulseRate: number;
  travel: number;
  active: number;
  dpr: number;
  still: boolean;
};

type Flow = {
  setLayout: (layout: Layout) => void;
  setConfig: (cfg: FlowConfig) => void;
  setColours: (pulse: string, hub: string, background: string) => void;
  setDirection: (index: number, value: number) => void;
  direction: (index: number) => number;
  setRunning: (on: boolean) => void;
  dispose: () => void;
};

const POOL = 192;

/**
 * The pulses: a fixed pool moving along pre-sampled routes at one speed in
 * pixels, so two pulses sharing a trunk ride it side by side and part at the
 * fork. Each route emits at its share of `pulseRate`; direction is a number
 * the host springs between 1 and −1, so a reversal turns pulses already in
 * flight. One sprite per colour, drawn into a Canvas 2D layer; nothing is
 * allocated per frame.
 */
function createFlow(canvas: HTMLCanvasElement, onFirstFrame: () => void): Flow {
  const ctx = canvas.getContext("2d");
  const read = colourReader();
  let layout: Layout | null = null;
  let cfg: FlowConfig = {
    pulseRate: 4,
    travel: 1800,
    active: -1,
    dpr: 2,
    still: false,
  };
  let dirs = new Float32Array(0);
  let acc = new Float32Array(0);
  let flash = new Float32Array(0);
  let hubFlash = 0;
  const route = new Int16Array(POOL);
  const pos = new Float32Array(POOL);
  const alive = new Uint8Array(POOL);
  let sprite: HTMLCanvasElement | null = null;
  let hubSprite: HTMLCanvasElement | null = null;
  let additive = true;
  let running = false;
  let frame = 0;
  let last = 0;
  let rng = 0x9e3779b9;
  let painted = false;
  let disposed = false;

  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  const makeSprite = (colour: string, dark: boolean) => {
    const s = document.createElement("canvas");
    s.width = 64;
    s.height = 64;
    const c = s.getContext("2d");
    if (!c) return s;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    // On a dark page the core burns white; on a light one it stays the hue,
    // which white would wash out.
    g.addColorStop(0, dark ? "rgb(255, 255, 255)" : colour);
    g.addColorStop(0.18, colour);
    g.addColorStop(1, colour);
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    // The halo falls off fast, so the head reads as a bead of light with a
    // glow rather than a flat disc.
    c.globalCompositeOperation = "destination-in";
    const fade = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, "rgba(0, 0, 0, 1)");
    fade.addColorStop(0.2, "rgba(0, 0, 0, 0.9)");
    // On paper a glow is a stain: keep the light theme's halo tight.
    fade.addColorStop(
      0.45,
      dark ? "rgba(0, 0, 0, 0.28)" : "rgba(0, 0, 0, 0.1)",
    );
    fade.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = fade;
    c.fillRect(0, 0, 64, 64);
    return s;
  };

  const resize = () => {
    if (!layout) return;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg.dpr, 0.5, 2),
    );
    const bw = Math.max(1, Math.round(layout.w * ratio));
    const bh = Math.max(1, Math.round(layout.h * ratio));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const spawn = (r: number, at: number) => {
    for (let i = 0; i < POOL; i += 1) {
      if (alive[i]) continue;
      alive[i] = 1;
      route[i] = r;
      pos[i] = at;
      return;
    }
  };

  const meanLength = () => {
    if (!layout || layout.routes.length === 0) return 200;
    let sum = 0;
    for (const r of layout.routes) sum += r.length;
    return sum / layout.routes.length;
  };

  const draw = () => {
    if (!ctx || !layout) return;
    ctx.clearRect(0, 0, layout.w, layout.h);
    // Under reduced motion the routes carry still beads in the SVG instead.
    if (cfg.still) return;
    ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
    const active = cfg.active;
    const head = 4 * clamp(Math.min(layout.w, layout.h) / 232, 0.75, 1.15);
    if (hubSprite) {
      const g = 0.22 + hubFlash * 0.5;
      const size = layout.hub.r * (4.2 + hubFlash * 1.4);
      ctx.globalAlpha = clamp(g, 0, 0.9);
      ctx.drawImage(
        hubSprite,
        layout.hub.x - size / 2,
        layout.hub.y - size / 2,
        size,
        size,
      );
    }
    if (sprite) {
      for (let i = 0; i < layout.nodes.length; i += 1) {
        const f = flash[i] ?? 0;
        if (f < 0.02) continue;
        const node = layout.nodes[i];
        if (!node) continue;
        const size = node.r * (3.4 + f * 1.6);
        ctx.globalAlpha = clamp(f * 0.6, 0, 0.6);
        ctx.drawImage(sprite, node.x - size / 2, node.y - size / 2, size, size);
      }
      for (let i = 0; i < POOL; i += 1) {
        if (!alive[i]) continue;
        const r = route[i] ?? 0;
        const rt = layout.routes[r];
        if (!rt) continue;
        const dim = active >= 0 && active !== r;
        const lit = active === r;
        const s = pos[i] ?? 0;
        const d = (dirs[r] ?? 1) >= 0 ? 1 : -1;
        const base = (lit ? 1.35 : 1) * head;
        // A head and a short tail of fading beads behind it.
        for (let k = 3; k >= 0; k -= 1) {
          const back = s - (d * k * base * 1.15) / rt.length;
          if (back < 0 || back > 1) continue;
          const p = pointAt(rt, back);
          const size = base * (k === 0 ? 5.5 : 4.2 - k * 0.6);
          const alpha = (k === 0 ? 1 : 0.5 / k) * (dim ? 0.28 : 1);
          ctx.globalAlpha = alpha;
          ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!painted) {
      painted = true;
      onFirstFrame();
    }
  };

  const step = (now: number) => {
    frame = 0;
    if (!running || disposed || !layout) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const speed = meanLength() / Math.max(0.2, cfg.travel / 1000);
    const n = layout.routes.length;
    for (let r = 0; r < n; r += 1) {
      const node = layout.nodes[r];
      const d = dirs[r] ?? 1;
      const rate = Math.max(0, cfg.pulseRate) * (node?.share ?? 0);
      acc[r] = (acc[r] ?? 0) + rate * dt;
      // A route that is turning round does not launch until it has turned.
      if ((acc[r] ?? 0) >= 1 && Math.abs(d) > 0.6) {
        acc[r] = (acc[r] ?? 0) - (1 + (rand() - 0.5) * 0.5);
        spawn(r, d > 0 ? 0 : 1);
        if (d > 0) hubFlash = Math.min(1, hubFlash + 0.35);
      } else if ((acc[r] ?? 0) > 2) acc[r] = 1;
      flash[r] = (flash[r] ?? 0) * Math.exp(-dt / 0.32);
    }
    hubFlash *= Math.exp(-dt / 0.3);
    for (let i = 0; i < POOL; i += 1) {
      if (!alive[i]) continue;
      const r = route[i] ?? 0;
      const rt = layout.routes[r];
      if (!rt) {
        alive[i] = 0;
        continue;
      }
      const d = dirs[r] ?? 1;
      const next = (pos[i] ?? 0) + (d * speed * dt) / rt.length;
      if (next >= 1) {
        alive[i] = 0;
        flash[r] = 1;
      } else if (next <= 0) {
        alive[i] = 0;
        hubFlash = Math.min(1, hubFlash + 0.5);
      } else pos[i] = next;
    }
    draw();
    frame = requestAnimationFrame(step);
  };

  return {
    setLayout: (next) => {
      const sameCount = layout?.routes.length === next.routes.length;
      layout = next;
      if (!sameCount) {
        const old = dirs;
        dirs = new Float32Array(next.routes.length).fill(1);
        for (let i = 0; i < Math.min(old.length, dirs.length); i += 1) {
          dirs[i] = old[i] ?? 1;
        }
        acc = new Float32Array(next.routes.length);
        flash = new Float32Array(next.routes.length);
        alive.fill(0);
        // Seed the routes with pulses already on their way, so the first
        // frame is a working system rather than an empty one filling up.
        for (let r = 0; r < next.routes.length; r += 1) {
          const share = next.nodes[r]?.share ?? 0;
          const count = Math.round(share * 6);
          for (let k = 0; k < count; k += 1) spawn(r, (k + rand()) / count);
        }
      }
      resize();
      if (!running) draw();
    },
    setConfig: (next) => {
      const dprChanged = next.dpr !== cfg.dpr;
      cfg = next;
      if (dprChanged) resize();
      if (!running) draw();
    },
    setColours: (pulse, hub, background) => {
      const bg = read(background);
      const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
      additive = lum < 0.45;
      sprite = makeSprite(pulse, additive);
      hubSprite = makeSprite(hub, additive);
      if (!running) draw();
    },
    setDirection: (index, value) => {
      if (index >= 0 && index < dirs.length) dirs[index] = value;
    },
    direction: (index) => dirs[index] ?? 1,
    setRunning: (on) => {
      if (on === running) return;
      running = on;
      if (on) {
        last = 0;
        if (!frame) frame = requestAnimationFrame(step);
      } else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    dispose: () => {
      disposed = true;
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

function Chevron({
  x,
  y,
  deg,
  reversed,
  lit,
  motionSafe,
  colour,
}: {
  x: number;
  y: number;
  deg: number;
  reversed: boolean;
  lit: boolean;
  motionSafe: boolean;
  colour: string;
}) {
  const turn = useMotionValue(reversed ? 180 : 0);
  React.useEffect(() => {
    const target = reversed ? 180 : 0;
    if (Math.abs(turn.get() - target) < 0.5) return;
    if (!motionSafe) {
      turn.jump(target);
      return;
    }
    const run = animate(turn, target, springs.snap);
    return () => run.stop();
  }, [reversed, motionSafe, turn]);
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <motion.path
        d="M -2.6 -3.4 L 2 0 L -2.6 3.4"
        fill="none"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={cn(
          "transition-opacity duration-150",
          lit ? "opacity-100" : "opacity-55",
        )}
        style={{ stroke: colour, rotate: turn, originX: 0.5, originY: 0.5 }}
      />
    </g>
  );
}

function NodeDisc({
  node,
  left,
  top,
  total,
  fmt,
  isReversed,
  lit,
  dimmed,
  kick,
  motionSafe,
  pulse,
  hub,
  tabbable,
  disabled,
  hintId,
  bind,
  onPress,
  onEnter,
  onLeave,
  onFocusNode,
  onBlurNode,
  onKey,
}: {
  node: LaidNode;
  left: string;
  top: string;
  total: number;
  fmt: (v: number) => string;
  isReversed: boolean;
  lit: boolean;
  dimmed: boolean;
  kick: number;
  motionSafe: boolean;
  pulse: string;
  hub: string;
  tabbable: boolean;
  disabled: boolean;
  hintId: string;
  bind: (node: HTMLButtonElement | null) => void;
  onPress: () => void;
  onEnter: () => void;
  onLeave: () => void;
  onFocusNode: (visible: boolean) => void;
  onBlurNode: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const scale = useMotionValue(1);
  const seen = React.useRef(kick);
  React.useEffect(() => {
    if (seen.current === kick) return;
    seen.current = kick;
    if (!motionSafe) return;
    // The kick is a landing: up quickly on a tween, then the recoil spring
    // brings it home with its two visible bounces.
    let back: AnimationPlaybackControls | null = null;
    const up = animate(scale, 1.32, {
      duration: durations.blink,
      ease: easings.enter,
      onComplete: () => {
        back = animate(scale, 1, springs.recoil);
      },
    });
    return () => {
      up.stop();
      back?.stop();
      scale.jump(1);
    };
  }, [kick, motionSafe, scale]);

  const pct = total > 0 ? Math.round(node.share * 100) : 0;
  const size = Math.max(26, Math.round(node.r * 2 + 10));
  const disc = Math.round(node.r * 2);
  return (
    <button
      ref={bind}
      type="button"
      tabIndex={disabled ? -1 : tabbable ? 0 : -1}
      disabled={disabled}
      aria-pressed={isReversed}
      aria-label={`${node.label}, ${fmt(node.value)}, ${pct} percent of flow`}
      aria-describedby={hintId}
      onClick={onPress}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onEnter();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") onLeave();
      }}
      onFocus={(event) =>
        onFocusNode(event.currentTarget.matches(":focus-visible"))
      }
      onBlur={onBlurNode}
      onKeyDown={onKey}
      className={cn(
        "absolute z-10 grid -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-default",
      )}
      style={{
        left,
        top,
        width: size,
        height: size,
      }}
    >
      <motion.span
        aria-hidden
        className={cn(
          "relative block rounded-full border-[1.5px] transition-[opacity,background-color] duration-150",
          dimmed ? "opacity-45" : "opacity-100",
        )}
        style={{
          width: disc,
          height: disc,
          scale,
          borderColor: lit ? pulse : hub,
          backgroundColor: isReversed
            ? "var(--background)"
            : `color-mix(in oklab, ${lit ? pulse : hub} ${lit ? 88 : 62}%, var(--background))`,
        }}
      >
        {isReversed ? (
          <span
            className="absolute inset-0 m-auto block size-[38%] rounded-full"
            style={{ backgroundColor: lit ? pulse : hub }}
          />
        ) : null}
      </motion.span>
      {kick > 0 && motionSafe ? (
        <motion.span
          key={kick}
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto block rounded-full border"
          style={{ width: disc, height: disc, borderColor: pulse }}
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.enter }}
        />
      ) : null}
    </button>
  );
}

/**
 * One hub feeding a ring of nodes through fine, root-like paths. Neighbours
 * share a trunk that forks half way, every trunk as thick as the flow it
 * carries, every route wandering a little and shedding hair-fine rootlets.
 * Pulses of light leave the hub along each route at a rate set by that node's
 * share, so the busy ones visibly draw more; pulses sharing a trunk ride it
 * together and part at the fork. Hovering or tabbing to a node lights its
 * route and shows its label, value and share; a press reverses its flow — the
 * route's direction springs through zero on `springs.snap`, so pulses in
 * flight slow, stop and run home, while the node kicks on `springs.recoil`
 * and its chevron turns. Under reduced motion the routes carry still beads
 * and a chevron each, and a reversal flips them at once.
 */
export function RootExchange({
  nodes = defaultRootNodes,
  hubLabel = "Hub",
  format,
  reversed,
  defaultReversed,
  onReversedChange,
  onActiveChange,
  pulseRate = 4,
  travel = 1800,
  curve = 0.55,
  rootlets = 0.5,
  palette = "cobalt",
  colors,
  seed = 7,
  paused = false,
  dpr = 2,
  label = "Flow from the hub",
  disabled = false,
  className,
}: RootExchangeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const fmt = format ?? defaultFormat;
  const tone = { ...(PALETTES[palette] ?? PALETTES.cobalt), ...colors };

  const [size, setSize] = React.useState({ w: 640, h: 224 });
  const [own, setOwn] = React.useState<string[]>(defaultReversed ?? []);
  const rev = reversed ?? own;
  const [hover, setHover] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [tabId, setTabId] = React.useState<string | null>(null);
  const [kicks, setKicks] = React.useState<Record<string, number>>({});
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [live, setLive] = React.useState(false);

  const layout = React.useMemo(
    () => buildLayout(nodes, size.w, size.h, curve, rootlets, seed),
    [nodes, size.w, size.h, curve, rootlets, seed],
  );

  const active = hover ?? focusId;
  const activeIndex = active
    ? layout.nodes.findIndex((n) => n.id === active)
    : -1;
  const activeNode = activeIndex >= 0 ? layout.nodes[activeIndex] : undefined;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriers = React.useRef<HTMLSpanElement | null>(null);
  const flow = React.useRef<Flow | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const visible = React.useRef(false);
  const pageShown = React.useRef(true);
  const dirRuns = React.useRef(new Map<number, AnimationPlaybackControls>());
  const runState = React.useRef({ paused, motionSafe });

  const report = (nextHover: string | null, nextFocus: string | null) => {
    const before = hover ?? focusId;
    const after = nextHover ?? nextFocus;
    setHover(nextHover);
    setFocusId(nextFocus);
    if (before !== after) onActiveChange?.(after);
  };

  const syncRunning = React.useCallback(() => {
    const s = runState.current;
    flow.current?.setRunning(
      visible.current && pageShown.current && !s.paused && s.motionSafe,
    );
  }, []);

  React.useEffect(() => {
    runState.current = { paused, motionSafe };
    syncRunning();
  }, [paused, motionSafe, syncRunning]);

  const readColours = React.useCallback(() => {
    const host = carriers.current;
    if (!host) return;
    const kids = Array.from(host.children);
    const at = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(128, 128, 128)";
    };
    flow.current?.setColours(at(0), at(1), at(2));
  }, []);

  // The flow is bound to its canvas: built with it, gone with it.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const f = createFlow(canvas, () => setLive(true));
    flow.current = f;
    readColours();
    syncRunning();
    return () => {
      f.dispose();
      if (flow.current === f) flow.current = null;
    };
  }, [readColours, syncRunning]);

  React.useEffect(() => {
    flow.current?.setLayout(layout);
  }, [layout]);

  React.useEffect(() => {
    flow.current?.setConfig({
      pulseRate,
      travel,
      active: activeIndex,
      dpr,
      still: !motionSafe,
    });
  }, [pulseRate, travel, activeIndex, dpr, motionSafe]);

  const colourKey = `${tone.pulse}|${tone.hub}`;
  React.useEffect(() => {
    readColours();
  }, [colourKey, readColours]);

  // Each route's direction follows the reversed set; a change springs it
  // through zero so the pulses already on it turn round.
  const revKey = rev.join("|");
  React.useEffect(() => {
    const f = flow.current;
    if (!f) return;
    const set = new Set(revKey ? revKey.split("|") : []);
    const runs = dirRuns.current;
    layout.nodes.forEach((node, i) => {
      const target = set.has(node.id) ? -1 : 1;
      if (Math.abs(f.direction(i) - target) < 0.001) return;
      runs.get(i)?.stop();
      if (!motionSafe) {
        f.setDirection(i, target);
        return;
      }
      runs.set(
        i,
        animate(f.direction(i), target, {
          ...springs.snap,
          onUpdate: (v) => f.setDirection(i, v),
          onComplete: () => runs.delete(i),
        }),
      );
    });
  }, [revKey, layout, motionSafe]);

  React.useEffect(() => {
    const runs = dirRuns.current;
    return () => {
      for (const run of runs.values()) run.stop();
      runs.clear();
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      pageShown.current = document.visibilityState !== "hidden";
      syncRunning();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [syncRunning]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = Math.max(80, Math.round(node.clientWidth));
        const h = Math.max(80, Math.round(node.clientHeight));
        setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
      });
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        syncRunning();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        visible.current = false;
      };
    },
    [syncRunning],
  );

  const toggle = (node: LaidNode) => {
    if (disabled) return;
    const on = rev.includes(node.id);
    const next = on ? rev.filter((id) => id !== node.id) : [...rev, node.id];
    if (reversed === undefined) setOwn(next);
    onReversedChange?.(next);
    setKicks((k) => ({ ...k, [node.id]: (k[node.id] ?? 0) + 1 }));
    setSaid((s) => ({
      n: s.n + 1,
      text: on
        ? `${node.label} flows out from the ${hubLabel.toLowerCase()} again.`
        : `${node.label} now flows in to the ${hubLabel.toLowerCase()}.`,
    }));
  };

  const firstTab = layout.order[0];
  const tabbable =
    tabId && layout.nodes.some((n) => n.id === tabId)
      ? tabId
      : firstTab !== undefined
        ? (layout.nodes[firstTab]?.id ?? null)
        : null;

  const onKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    node: LaidNode,
  ) => {
    const order = layout.order;
    const at = order.indexOf(node.index);
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = order[(at + 1) % order.length] ?? -1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = order[(at - 1 + order.length) % order.length] ?? -1;
    } else if (event.key === "Home") next = order[0] ?? -1;
    else if (event.key === "End") next = order[order.length - 1] ?? -1;
    if (next < 0) return;
    event.preventDefault();
    const target = layout.nodes[next];
    if (!target) return;
    setTabId(target.id);
    buttons.current.get(target.id)?.focus();
  };

  const isLitStrand = (members: number[]) =>
    activeIndex >= 0 && members.includes(activeIndex);
  const strandClass = (members: number[]) =>
    cn(
      "transition-opacity duration-150",
      activeIndex < 0
        ? "opacity-80"
        : isLitStrand(members)
          ? "opacity-100"
          : "opacity-30",
    );

  const showBeads = !motionSafe || !live;
  const revSet = new Set(rev);
  const groupName = `${label}: ${hubLabel}, ${fmt(layout.total)} to ${layout.nodes.length} ${layout.nodes.length === 1 ? "node" : "nodes"}`;

  // The tag sits straight above or below its node, on the side toward the
  // middle of the box, so it never leaves the box and rarely covers a route.
  const tag = activeNode
    ? (() => {
        const right = activeNode.x > layout.w / 2;
        const below = activeNode.y < layout.h / 2;
        const ax = activeNode.x + (right ? activeNode.r : -activeNode.r);
        const ay = activeNode.y + (below ? 1 : -1) * (activeNode.r + 6);
        return {
          left: pct3(ax / layout.w),
          top: pct3(ay / layout.h),
          tx: right ? "-100%" : "0%",
          ty: below ? "0%" : "-100%",
          pct: layout.total > 0 ? Math.round(activeNode.share * 100) : 0,
          inward: revSet.has(activeNode.id),
        };
      })()
    : null;

  return (
    <div
      ref={bindRoot}
      data-live={live && motionSafe ? "" : undefined}
      className={cn(
        "group/root-exchange relative isolate h-56 w-full overflow-clip select-none",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${layout.w} ${layout.h}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <g fill="none" strokeLinecap="round">
          {layout.hairs.map((s, i) => (
            <path
              key={`h${i}`}
              d={s.d}
              strokeWidth={s.width}
              vectorEffect="non-scaling-stroke"
              className={strandClass(s.members)}
              style={{ stroke: tone.route, strokeOpacity: 0.5 }}
            />
          ))}
          {layout.trunks.map((s, i) => (
            <path
              key={`t${i}`}
              d={s.d}
              strokeWidth={s.width}
              vectorEffect="non-scaling-stroke"
              className={strandClass(s.members)}
              style={{
                stroke: isLitStrand(s.members) ? tone.pulse : tone.route,
              }}
            />
          ))}
          {layout.branches.map((s, i) => (
            <path
              key={`b${i}`}
              d={s.d}
              strokeWidth={s.width}
              vectorEffect="non-scaling-stroke"
              className={strandClass(s.members)}
              style={{
                stroke: isLitStrand(s.members) ? tone.pulse : tone.route,
              }}
            />
          ))}
        </g>
        <g
          className={cn(
            "transition-opacity duration-300",
            showBeads ? "opacity-100" : "opacity-0",
          )}
        >
          {layout.beads.map((list, r) =>
            list.map((b, k) => {
              const toward = revSet.has(layout.nodes[r]?.id ?? "")
                ? 1 - b.s
                : b.s;
              const dim = activeIndex >= 0 && activeIndex !== r;
              return (
                <circle
                  key={`${r}-${k}`}
                  cx={b.x}
                  cy={b.y}
                  r={activeIndex === r ? 2.4 : 1.8}
                  style={{
                    fill: tone.pulse,
                    opacity: r2((0.3 + 0.65 * toward) * (dim ? 0.35 : 1)),
                  }}
                />
              );
            }),
          )}
        </g>
        {layout.chevrons.map((c, i) => (
          <Chevron
            key={layout.nodes[i]?.id ?? i}
            x={c.x}
            y={c.y}
            deg={c.deg}
            reversed={revSet.has(layout.nodes[i]?.id ?? "")}
            lit={activeIndex === i}
            motionSafe={motionSafe}
            colour={activeIndex === i ? tone.pulse : tone.route}
          />
        ))}
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px]"
        style={{
          left: pct3(layout.hub.x / layout.w),
          top: pct3(layout.hub.y / layout.h),
          width: r2(layout.hub.r * 2),
          height: r2(layout.hub.r * 2),
          borderColor: tone.hub,
          backgroundColor: `color-mix(in oklab, ${tone.hub} 30%, var(--background))`,
        }}
      >
        <span
          className="absolute inset-0 m-auto block size-[46%] rounded-full"
          style={{ backgroundColor: tone.hub }}
        />
      </span>
      <div role="group" aria-label={groupName} className="absolute inset-0">
        {layout.nodes.map((node) => (
          <NodeDisc
            key={node.id}
            node={node}
            left={pct3(node.x / layout.w)}
            top={pct3(node.y / layout.h)}
            total={layout.total}
            fmt={fmt}
            isReversed={revSet.has(node.id)}
            lit={activeIndex === node.index}
            dimmed={activeIndex >= 0 && activeIndex !== node.index}
            kick={kicks[node.id] ?? 0}
            motionSafe={motionSafe}
            pulse={tone.pulse}
            hub={tone.hub}
            tabbable={tabbable === node.id}
            disabled={disabled}
            hintId={hintId}
            bind={(el) => {
              if (el) buttons.current.set(node.id, el);
              else buttons.current.delete(node.id);
            }}
            onPress={() => toggle(node)}
            onEnter={() => report(node.id, focusId)}
            onLeave={() => report(null, focusId)}
            onFocusNode={(isVisible) => {
              setTabId(node.id);
              report(hover, isVisible ? node.id : null);
            }}
            onBlurNode={() => report(hover, null)}
            onKey={(event) => onKey(event, node)}
          />
        ))}
      </div>
      {tag && activeNode ? (
        <motion.div
          key={activeNode.id}
          aria-hidden
          className="pointer-events-none absolute z-20 max-w-[46%] rounded-2 border border-hairline-strong bg-popover/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm"
          style={{
            left: tag.left,
            top: tag.top,
            translateX: tag.tx,
            translateY: tag.ty,
          }}
          initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? springs.snap
              : { duration: durations.fast, ease: easings.enter }
          }
        >
          <p className="truncate text-xs leading-4 font-medium text-foreground">
            {activeNode.label}
          </p>
          <p className="mt-0.5 font-mono text-[10px] leading-3 tracking-[0.04em] whitespace-nowrap text-ink-2 tabular-nums">
            {fmt(activeNode.value)} · {tag.pct}% ·{" "}
            <span style={{ color: tone.pulse }}>
              {tag.inward ? "in" : "out"}
            </span>
          </p>
        </motion.div>
      ) : null}
      <span
        ref={carriers}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span
          className="transition-colors duration-1"
          style={{ color: tone.pulse }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: tone.hub }}
        />
        <span className="text-background transition-colors duration-1" />
      </span>
      <p id={hintId} className="sr-only">
        Arrow keys move between nodes; Enter or Space reverses a node&apos;s
        flow.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
