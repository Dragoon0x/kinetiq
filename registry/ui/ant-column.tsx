"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/** A place in the box, as fractions of its width and height. */
export type AntColumnPoint = { x: number; y: number };

/** A pebble: its centre as fractions of the box, its radius in px. */
export type AntColumnPebble = { x: number; y: number; size: number };

export type AntColumnProps = {
  /** How many ants live in the nest, 10 to 400. @default 140 */
  ants?: number;
  /** How strong and how lasting the scent trails are, 0 (faint, quick to fade, loose paths) to 1 (bold, lasting, a tight column). @default 0.6 */
  pheromone?: number;
  /** The size of one pixel of the colony, in px, 2 to 6. Ants are two pixels long. @default 3 */
  pixel?: number;
  /** How fast the ants walk, 0 to 1. @default 0.5 */
  speed?: number;
  /** How much each ant meanders off its line, 0 (marching) to 1 (dithering). @default 0.3 */
  wander?: number;
  /** Where the nest's mouth sits, as fractions of the box. @default { x: 0.1, y: 0.72 } */
  nest?: AntColumnPoint;
  /** Crumbs already on the ground when the colony starts, as fractions of the box. @default [{ x: 0.86, y: 0.32 }] */
  crumbs?: readonly AntColumnPoint[];
  /** How many bits a crumb breaks into: one ant carries one bit home. @default 18 */
  crumbSize?: number;
  /** Pebbles the ants walk round: centres as fractions of the box, radii in px. @default two pebbles */
  obstacles?: readonly AntColumnPebble[];
  /** Ants also walk round any element inside the colony marked `data-obstacle`, such as a card in your content. @default true */
  avoidContent?: boolean;
  /** The ants' colour, any CSS colour; resolved on the element so it follows the theme. @default "var(--foreground)" */
  antColor?: string;
  /** The scent trails' colour. @default "var(--accent-bright)" */
  trailColor?: string;
  /** The crumbs' colour: a pigment at a fixed lightness, so it reads the same in both themes. @default "oklch(from var(--warn) 0.8 c h)" */
  crumbColor?: string;
  /** The nest mound's and the pebbles' colour. @default "var(--ink-3)" */
  earthColor?: string;
  /** Content above the colony: a heading, a card, a call to action. Mark a card `data-obstacle` and the column routes round it. */
  children?: React.ReactNode;
  /** The pointer leaves a scent the ants seek and a click drops a crumb; the keys do both. @default true */
  interactive?: boolean;
  /** Hold the colony where it is. @default false */
  paused?: boolean;
  /** Names the colony for assistive technology. @default "Ant colony" */
  label?: string;
  /** Seeds every ant's wander and every crumb's shape, so two colonies never walk alike. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires each time an ant brings a bit home, with the colony's total so far. */
  onCarry?: (total: number) => void;
  /** Fires when a crumb is dropped, with its place in px from the box's top left. */
  onCrumb?: (x: number, y: number) => void;
  /** Shows the colony at work but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const MAX_ANTS = 400;
const MAX_CRUMBS = 6;
const MAX_PATH = 4096;
const STEP = 1 / 60;
/** How far ahead the three scent sensors reach, in cells, and how wide they look. */
const SENSOR_REACH = 3.5;
const SENSOR_ANGLE = 0.6;
const TAU = Math.PI * 2;

const DEFAULT_NEST: AntColumnPoint = { x: 0.1, y: 0.72 };
const DEFAULT_CRUMBS: readonly AntColumnPoint[] = [{ x: 0.86, y: 0.32 }];
const DEFAULT_PEBBLES: readonly AntColumnPebble[] = [
  { x: 0.47, y: 0.5, size: 16 },
  { x: 0.66, y: 0.74, size: 10 },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const wrap = (a: number) => {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  if (v < -Math.PI) v += TAU;
  return v;
};

/** A small seeded generator: the same wander and crumbs for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

type Palette = {
  ant: Rgb;
  trail: Rgb;
  crumb: Rgb;
  crumbLit: Rgb;
  earth: Rgb;
  earthLit: Rgb;
  /** The nest's mouth: the earth colour deep in shadow, dark in either theme. */
  hole: Rgb;
};

type World = {
  w: number;
  h: number;
  /** px per cell, and device px per cell. */
  cell: number;
  scale: number;
  gw: number;
  gh: number;
  /** "Food" scent: laid by ants coming home with something, followed out. */
  food: Float32Array;
  /** "Home" scent: laid by ants going out, followed home. */
  home: Float32Array;
  tmp: Float32Array;
  /** 1 where an ant cannot step: the border, pebbles and marked content. */
  solid: Uint8Array;
  /** How a cell is drawn: 0 nothing, 1 pebble, 2 pebble lit, 3 pebble shade. */
  look: Uint8Array;
  dist: Int32Array;
  queue: Int32Array;
  img: ImageData;
  off: HTMLCanvasElement;
  offCtx: CanvasRenderingContext2D;
  nx: number;
  ny: number;
  /** The tallest scent anywhere, kept while it evaporates. */
  peak: number;
};

type Crumb = {
  id: number;
  fx: number;
  fy: number;
  x: number;
  y: number;
  bits: number;
  total: number;
  /** Bits on their way home. */
  transit: number;
  /** Steps until the next bit comes loose: a crumb is worked, not emptied at once. */
  rest: number;
  /** Each bit's offset from the centre, outermost last, so ants take from the edge. */
  layout: Int8Array;
  /** The landing: height above the ground in cells and its speed. */
  drop: number;
  dropV: number;
  dust: number;
};

type Colony = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  a: Float32Array;
  /** 0 in the nest, 1 out searching, 2 heading home. */
  state: Uint8Array;
  /** 0 nothing, 1 a bit of crumb, 2 the pointer's scent. */
  carry: Uint8Array;
  carryId: Int32Array;
  /** Steps since leaving the nest or since finding something. */
  t: Float32Array;
};

type Sim = {
  last: number;
  carry: number;
  emerge: number;
  /** The scent's place in px, its spring velocity, and how strongly it shows. */
  lx: number;
  ly: number;
  lvx: number;
  lvy: number;
  lure: number;
  flash: number;
  stored: number;
  warmed: boolean;
  /** Steps taken, for the light blur every fourth step and the scent ring's turn. */
  steps: number;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  source: "pointer" | "key" | null;
  placed: boolean;
};

type Api = {
  rebuild: () => void;
  readColours: () => void;
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
  sync: () => void;
};

/** Content controls the colony must leave alone. */
const INTERACTIVE =
  "a[href],button:not([data-ants]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true']";

function allocColony(): Colony {
  return {
    n: 0,
    x: new Float32Array(MAX_ANTS),
    y: new Float32Array(MAX_ANTS),
    a: new Float32Array(MAX_ANTS),
    state: new Uint8Array(MAX_ANTS),
    carry: new Uint8Array(MAX_ANTS),
    carryId: new Int32Array(MAX_ANTS),
    t: new Float32Array(MAX_ANTS),
  };
}

/** The nest's cells round its mouth: 0 none, 1 mouth, 2 rim, 3 mound lit, 4 mound. */
function nestCell(x: number, y: number): number {
  if (x >= -1 && x <= 1 && y >= -1 && y <= 0) return 1;
  const r = Math.hypot(x, y * 1.3);
  if (r > 5.5) return 0;
  if (r < 2.9) return 2;
  if (r < 3.9 || (x + y) % 2 === 0) return (x * 3 + y * 5) % 7 === 0 ? 3 : 4;
  return 0;
}

/** A crumb's bits as a seeded cluster: offsets in cells, nearest the centre first. */
function crumbLayout(bits: number, rand: () => number): Int8Array {
  const spots: [number, number, number][] = [];
  const reach = Math.ceil(Math.sqrt(bits) * 0.9) + 1;
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      spots.push([dx, dy, Math.hypot(dx, dy * 1.15) + rand() * 0.9]);
    }
  }
  spots.sort((p, q) => p[2] - q[2]);
  const out = new Int8Array(bits * 2);
  for (let i = 0; i < bits; i += 1) {
    const s = spots[i] ?? [0, 0, 0];
    out[i * 2] = s[0];
    out[i * 2 + 1] = s[1];
  }
  return out;
}

/**
 * A colony of pixel ants on a transparent Canvas 2D layer. The box is a
 * coarse grid of `pixel`-sized cells; the nest, the pebbles, the crumbs, the
 * ants and their scent are drawn cell by cell and scaled up with smoothing
 * off, so the colony stays crisp at any density.
 *
 * It is a two-scent forager model stepped at 60 Hz. Ants pour out of the nest
 * and search: three sensors ahead read the food scent and they turn toward
 * the strongest, wandering a little, laying home scent as they go. An ant
 * that reaches the pointer's scent or a crumb turns round and walks home on
 * the home scent and its own sense of where the nest is, laying food scent;
 * both scents evaporate, the shortest path is reinforced fastest, and within
 * seconds the search condenses into a single-file column round every pebble.
 * The scent follows the pointer on the glide spring, so the column's head
 * swings after it and the body wobbles as the ants re-route. A click drops a
 * crumb that lands on the recoil spring; ants carry it home a bit at a time.
 * With nothing left to seek, the colony files home and the loop stops.
 *
 * The keyboard's way in is a transparent button behind your content: focus
 * puts the scent down, the arrow keys move it, Enter or Space drops a crumb
 * there, Escape lifts it. Under reduced motion the column is laid at once
 * along the shortest route round every obstacle and holds still, and a crumb
 * still empties, a bit a second, into the nest's count.
 */
export function AntColumn({
  ants = 140,
  pheromone = 0.6,
  pixel = 3,
  speed = 0.5,
  wander = 0.3,
  nest = DEFAULT_NEST,
  crumbs = DEFAULT_CRUMBS,
  crumbSize = 18,
  obstacles = DEFAULT_PEBBLES,
  avoidContent = true,
  antColor = "var(--foreground)",
  trailColor = "var(--accent-bright)",
  crumbColor = "oklch(from var(--warn) 0.8 c h)",
  earthColor = "var(--ink-3)",
  children,
  interactive = true,
  paused = false,
  label = "Ant colony",
  seed = 3,
  dpr = 2,
  onCarry,
  onCrumb,
  disabled = false,
  className,
}: AntColumnProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const k = {
    ants: Math.round(clamp(ants, 10, MAX_ANTS)),
    pheromone: clamp01(pheromone),
    pixel: Math.round(clamp(pixel, 2, 6)),
    speed: clamp01(speed),
    wander: clamp01(wander),
    nx: clamp(nest.x, 0.03, 0.97),
    ny: clamp(nest.y, 0.06, 0.94),
    bits: Math.round(clamp(crumbSize, 1, 40)),
    avoid: avoidContent,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };
  const pebbleKey = obstacles
    .map((o) => `${r2(o.x)},${r2(o.y)},${r2(o.size)}`)
    .join("|");
  const crumbKey = crumbs.map((c) => `${r2(c.x)},${r2(c.y)}`).join("|");
  const paints = [antColor, trailColor, crumbColor, earthColor];
  const paintKey = paints.join("|");

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const world = React.useRef<World | null>(null);
  const colony = React.useRef<Colony | null>(null);
  const crumbList = React.useRef<Crumb[]>([]);
  const crumbId = React.useRef(0);
  const pal = React.useRef<Palette | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const rand = React.useRef<() => number>(lcg(seed));
  const path = React.useRef({ xy: new Float32Array(MAX_PATH * 2), n: 0 });
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    emerge: 0,
    lx: 0,
    ly: 0,
    lvx: 0,
    lvy: 0,
    lure: 0,
    flash: 0,
    stored: 0,
    warmed: false,
    steps: 0,
  });
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    present: false,
    source: null,
    placed: false,
  });
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const sizer = React.useRef<ResizeObserver | null>(null);
  const reducedTimer = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onCarry, onCrumb });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const rgbOf = (colour: string): Rgb => {
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return [128, 128, 128];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    const at = (i: number) => {
      const span = carriers.children[i];
      return rgbOf(span ? getComputedStyle(span).color : "rgb(128, 128, 128)");
    };
    const lift = (c: Rgb, t: number): Rgb => [
      Math.round(c[0] + (255 - c[0]) * t),
      Math.round(c[1] + (255 - c[1]) * t),
      Math.round(c[2] + (255 - c[2]) * t),
    ];
    const crumb = at(2);
    const earth = at(3);
    pal.current = {
      ant: at(0),
      trail: at(1),
      crumb,
      crumbLit: lift(crumb, 0.35),
      earth,
      earthLit: lift(earth, 0.3),
      hole: [
        Math.round(earth[0] * 0.28),
        Math.round(earth[1] * 0.28),
        Math.round(earth[2] * 0.3),
      ],
    };
  };

  const idx = (x: number, y: number) => {
    const g = world.current;
    if (!g) return -1;
    const cx = Math.round(x);
    const cy = Math.round(y);
    if (cx < 0 || cy < 0 || cx >= g.gw || cy >= g.gh) return -1;
    return cy * g.gw + cx;
  };

  const free = (x: number, y: number) => {
    const g = world.current;
    const i = idx(x, y);
    return Boolean(g && i >= 0 && g.solid[i] === 0);
  };

  /** The nearest free cell to (x, y), searching outward ring by ring. */
  const nearestFree = (x: number, y: number) => {
    if (free(x, y)) return { x, y };
    for (let r = 1; r < 24; r += 1) {
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * TAU;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (free(px, py)) return { x: px, y: py };
      }
    }
    return { x, y };
  };

  const placeCrumb = (fx: number, fy: number, landing: boolean) => {
    const g = world.current;
    const list = crumbList.current;
    if (list.length >= MAX_CRUMBS) list.shift();
    crumbId.current += 1;
    const c: Crumb = {
      id: crumbId.current,
      fx,
      fy,
      x: 0,
      y: 0,
      bits: k.bits,
      total: k.bits,
      transit: 0,
      rest: 0,
      layout: crumbLayout(k.bits, rand.current),
      drop: landing ? 7 : 0,
      dropV: 0,
      dust: 0,
    };
    if (g) {
      const at = nearestFree(fx * g.gw, fy * g.gh);
      c.x = at.x;
      c.y = at.y;
    }
    list.push(c);
    return c;
  };

  /** Pebbles and marked content into the solid mask, border included. */
  const rasterize = (g: World) => {
    g.solid.fill(0);
    g.look.fill(0);
    for (let x = 0; x < g.gw; x += 1) {
      g.solid[x] = 1;
      g.solid[(g.gh - 1) * g.gw + x] = 1;
    }
    for (let y = 0; y < g.gh; y += 1) {
      g.solid[y * g.gw] = 1;
      g.solid[y * g.gw + g.gw - 1] = 1;
    }
    for (const o of obstacles) {
      const cx = o.x * g.gw;
      const cy = o.y * g.gh;
      const r = Math.max(1, o.size / g.cell);
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y += 1) {
        for (
          let x = Math.floor(cx - r - 1);
          x <= Math.ceil(cx + r + 1);
          x += 1
        ) {
          if (x < 0 || y < 0 || x >= g.gw || y >= g.gh) continue;
          const dx = x - cx;
          const dy = (y - cy) * 1.2;
          const d = Math.hypot(dx, dy);
          if (d > r) continue;
          const i = y * g.gw + x;
          g.solid[i] = 1;
          // Lit from the upper left, shaded toward the lower right.
          const side = (dx + dy) / r;
          g.look[i] = side < -0.55 ? 2 : side > 0.6 && d > r * 0.45 ? 3 : 1;
        }
      }
    }
    const root = rootRef.current;
    if (!k.avoid || !root) return;
    const box = root.getBoundingClientRect();
    for (const el of root.querySelectorAll("[data-obstacle]")) {
      sizer.current?.observe(el);
      const r = el.getBoundingClientRect();
      const x0 = Math.floor((r.left - box.left - root.clientLeft) / g.cell) - 1;
      const y0 = Math.floor((r.top - box.top - root.clientTop) / g.cell) - 1;
      const x1 = Math.ceil((r.right - box.left - root.clientLeft) / g.cell) + 1;
      const y1 = Math.ceil((r.bottom - box.top - root.clientTop) / g.cell) + 1;
      // A sliver between the content and the box's edge is closed: ants
      // squeezing through it would pull the column into a loop round it.
      const ex0 = x0 < 6 ? 0 : x0;
      const ey0 = y0 < 6 ? 0 : y0;
      const ex1 = g.gw - x1 < 6 ? g.gw : x1;
      const ey1 = g.gh - y1 < 6 ? g.gh : y1;
      for (let y = Math.max(0, ey0); y < Math.min(g.gh, ey1); y += 1) {
        for (let x = Math.max(0, ex0); x < Math.min(g.gw, ex1); x += 1) {
          g.solid[y * g.gw + x] = 1;
        }
      }
    }
  };

  const rebuild = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 16 || h < 16) return;
    const scale = Math.min(window.devicePixelRatio || 1, k.dpr);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const cell = k.pixel;
    const gw = Math.ceil(w / cell);
    const gh = Math.ceil(h / cell);
    const was = world.current;
    let g: World;
    if (was && was.gw === gw && was.gh === gh && was.cell === cell) {
      g = was;
      g.w = w;
      g.h = h;
      g.scale = scale;
    } else {
      const off = document.createElement("canvas");
      off.width = gw;
      off.height = gh;
      const offCtx = off.getContext("2d");
      if (!offCtx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      const n = gw * gh;
      g = {
        w,
        h,
        cell,
        scale,
        gw,
        gh,
        food: new Float32Array(n),
        home: new Float32Array(n),
        tmp: new Float32Array(n),
        solid: new Uint8Array(n),
        look: new Uint8Array(n),
        dist: new Int32Array(n),
        queue: new Int32Array(n),
        img: offCtx.createImageData(gw, gh),
        off,
        offCtx,
        nx: 0,
        ny: 0,
        peak: 0,
      };
      // Ants keep their place in the box through a resize.
      const col = colony.current;
      if (was && col) {
        for (let i = 0; i < col.n; i += 1) {
          col.x[i] = (col.x[i]! / was.gw) * gw;
          col.y[i] = (col.y[i]! / was.gh) * gh;
        }
      }
    }
    world.current = g;
    g.nx = Math.round(k.nx * gw);
    g.ny = Math.round(k.ny * gh);
    rasterize(g);
    // The nest keeps its own ground clear, whatever is laid over it.
    for (let y = -4; y <= 4; y += 1) {
      for (let x = -5; x <= 5; x += 1) {
        const cx = g.nx + x;
        const cy = g.ny + y;
        if (cx <= 0 || cy <= 0 || cx >= gw - 1 || cy >= gh - 1) continue;
        g.solid[cy * gw + cx] = 0;
        g.look[cy * gw + cx] = 0;
      }
    }
    for (const c of crumbList.current) {
      const at = nearestFree(c.fx * gw, c.fy * gh);
      c.x = at.x;
      c.y = at.y;
    }
    if (!pal.current) readColours();
    const s = sim.current;
    if (!hand.current.placed) {
      s.lx = w * 0.6;
      s.ly = h * 0.4;
    }
    // The colony is already at work when it is first seen: a few seconds of
    // foraging run before the first frame, so a card opens on a column
    // forming rather than on an empty mound.
    if (!s.warmed && k.motionSafe && !k.paused) {
      s.warmed = true;
      for (let i = 0; i < 360; i += 1) step();
    }
    draw();
    kick();
  };

  /** Whether anything is worth walking to: a crumb with bits or the scent. */
  const hasTarget = () => {
    if (hand.current.present && k.enabled) return true;
    for (const c of crumbList.current) if (c.bits > 0) return true;
    return false;
  };

  const step = () => {
    const g = world.current;
    const col = colony.current;
    if (!g || !col) return;
    const s = sim.current;
    const hd = hand.current;
    const rnd = rand.current;
    const cell = g.cell;
    col.n = k.ants;
    s.steps += 1;

    // The scent follows the hand on the glide spring.
    const gs = springs.glide;
    if (hd.present && k.enabled) {
      s.lvx +=
        ((-gs.stiffness * (s.lx - hd.x) - gs.damping * s.lvx) / gs.mass) * STEP;
      s.lvy +=
        ((-gs.stiffness * (s.ly - hd.y) - gs.damping * s.lvy) / gs.mass) * STEP;
      s.lx += s.lvx * STEP;
      s.ly += s.lvy * STEP;
      s.lure = Math.min(1, s.lure + STEP * 5);
    } else {
      s.lure = Math.max(0, s.lure - STEP * 4);
    }
    const lureOn = hd.present && k.enabled;
    const lx = s.lx / cell;
    const ly = s.ly / cell;
    s.flash = Math.max(0, s.flash - STEP * 4);

    // Crumbs land on the recoil spring and puff a little dust.
    const rs = springs.recoil;
    for (const c of crumbList.current) {
      if (c.drop !== 0 || c.dropV !== 0) {
        const before = c.drop;
        c.dropV +=
          ((-rs.stiffness * c.drop - rs.damping * c.dropV) / rs.mass) * STEP;
        c.drop += c.dropV * STEP;
        if (before > 0 && c.drop <= 0) c.dust = 1;
        if (Math.abs(c.drop) < 0.02 && Math.abs(c.dropV) < 0.05) {
          c.drop = 0;
          c.dropV = 0;
        }
      }
      c.dust = Math.max(0, c.dust - STEP * 3);
      c.rest -= 1;
    }

    const targets = hasTarget();
    // Out of the mouth one after another: the pour.
    if (targets) {
      s.emerge += STEP * 30;
      for (let i = 0; i < col.n && s.emerge >= 1; i += 1) {
        if (col.state[i] !== 0) continue;
        s.emerge -= 1;
        col.state[i] = 1;
        col.carry[i] = 0;
        col.t[i] = 0;
        col.x[i] = g.nx + (rnd() - 0.5);
        col.y[i] = g.ny + (rnd() - 0.5);
        col.a[i] = rnd() * TAU;
      }
      s.emerge = Math.min(s.emerge, 1);
    } else s.emerge = 0;

    const pace = (40 + 110 * k.speed) / cell / 60;
    const halfLife = 0.6 + 7.4 * k.pheromone * k.pheromone;
    const keep = Math.pow(0.5, STEP / halfLife);
    const lay = 0.25 + 0.75 * k.pheromone;
    const jitter = 0.08 + 0.7 * k.wander;
    // Strong scent is followed hard (a bold, bending column); faint scent
    // barely steers, and the ants walk more by their own bearing.
    const follow = 0.12 + 0.22 * k.pheromone;
    const smellReach = Math.hypot(g.gw, g.gh) * 0.6;
    const list = crumbList.current;
    const sense = (out: boolean, x: number, y: number) => {
      const i = idx(x, y);
      if (i < 0 || g.solid[i] === 1) return -1;
      // Homeward ants keep to the column as well: it is the way they came,
      // so both directions share one lane instead of drawing a loop.
      return out ? g.food[i]! : g.home[i]! + g.food[i]! * 0.8;
    };

    for (let i = 0; i < col.n; i += 1) {
      const st = col.state[i]!;
      if (st === 0) continue;
      let x = col.x[i]!;
      let y = col.y[i]!;
      let a = col.a[i]!;
      const t = col.t[i]! + 1;
      col.t[i] = t;
      const out = st === 1;
      const lft = sense(
        out,
        x + Math.cos(a - SENSOR_ANGLE) * SENSOR_REACH,
        y + Math.sin(a - SENSOR_ANGLE) * SENSOR_REACH,
      );
      const mid = sense(
        out,
        x + Math.cos(a) * SENSOR_REACH,
        y + Math.sin(a) * SENSOR_REACH,
      );
      const rgt = sense(
        out,
        x + Math.cos(a + SENSOR_ANGLE) * SENSOR_REACH,
        y + Math.sin(a + SENSOR_ANGLE) * SENSOR_REACH,
      );
      const best = Math.max(lft, mid, rgt);
      let turn = 0;
      if (best > 0.02) {
        if (mid < lft || mid < rgt) turn = lft > rgt ? -follow : follow;
      }
      // On a strong trail an ant marches; off it, it dithers.
      const onTrail = Math.min(1, Math.max(0, mid) * 2);
      turn += (rnd() - 0.5) * jitter * (1 - 0.7 * onTrail);
      // Where this ant would go if nothing were in the way.
      let want = Number.NaN;

      if (out) {
        // The nearest thing worth reaching, smelled from afar.
        let tx = 0;
        let ty = 0;
        let td = Infinity;
        let found: Crumb | null = null;
        if (lureOn) {
          td = Math.hypot(lx - x, ly - y);
          tx = lx;
          ty = ly;
        }
        for (const c of list) {
          if (c.bits <= 0) continue;
          const d = Math.hypot(c.x - x, c.y - y);
          if (d < td) {
            td = d;
            tx = c.x;
            ty = c.y;
            found = c;
          }
        }
        if (td < Infinity) {
          want = Math.atan2(ty - y, tx - x);
          const near = clamp01(1 - td / smellReach);
          turn +=
            wrap(Math.atan2(ty - y, tx - x) - a) * (0.06 + 0.25 * near * near);
          const reach = found ? 1.5 + Math.sqrt(found.total) * 0.5 : 2.5;
          if (td < reach) {
            // A worked crumb gives up a bit every half second; an ant that
            // arrives between bits turns home with the scent alone, and the
            // column still grows stronger for it.
            if (found && found.rest <= 0) {
              found.bits -= 1;
              found.transit += 1;
              found.rest = 30;
              col.carry[i] = 1;
              col.carryId[i] = found.id;
            } else col.carry[i] = 2;
            col.state[i] = 2;
            col.t[i] = 0;
            a += Math.PI;
            col.a[i] = a;
            continue;
          }
        }
        // Lost ants and ants with nothing to seek walk home.
        if (t > 1500 || (!targets && rnd() < 0.012)) {
          col.state[i] = 2;
          col.carry[i] = 0;
          col.t[i] = 0;
        }
      } else {
        // Path integration: an ant always knows roughly where home is.
        // On the column it trusts the column; off it, its own bearing.
        const dn = Math.hypot(g.nx - x, g.ny - y);
        want = Math.atan2(g.ny - y, g.nx - x);
        turn +=
          wrap(want - a) *
          (0.09 + 0.25 * clamp01(1 - dn / 18)) *
          (1 - 0.4 * onTrail);
        if (dn < 2.2) {
          if (col.carry[i] === 1) {
            s.stored += 1;
            s.flash = 1;
            const id = col.carryId[i]!;
            const c = list.find((v) => v.id === id);
            if (c) c.transit -= 1;
            report.current.onCarry?.(s.stored);
          }
          col.carry[i] = 0;
          if (targets) {
            col.state[i] = 1;
            col.t[i] = 0;
            col.a[i] = a + Math.PI + (rnd() - 0.5);
          } else col.state[i] = 0;
          continue;
        }
      }

      a += turn;
      let nx = x + Math.cos(a) * pace;
      let ny = y + Math.sin(a) * pace;
      if (!free(nx, ny)) {
        // Feel round the obstacle, trying first the side that turns toward
        // where the ant is going, so the column takes the short way round.
        const side = Number.isNaN(want)
          ? i % 2 === 0
            ? 1
            : -1
          : wrap(want - a) >= 0
            ? 1
            : -1;
        let moved = false;
        for (let tryN = 1; tryN <= 6 && !moved; tryN += 1) {
          const da =
            side * (tryN % 2 === 1 ? 1 : -1) * Math.ceil(tryN / 2) * 0.55;
          const ax = Math.cos(a + da) * pace;
          const ay = Math.sin(a + da) * pace;
          if (free(x + ax, y + ay)) {
            a += da;
            nx = x + ax;
            ny = y + ay;
            moved = true;
          }
        }
        if (!moved) {
          a += Math.PI;
          nx = x;
          ny = y;
        }
      }
      x = nx;
      y = ny;
      col.x[i] = x;
      col.y[i] = y;
      col.a[i] = wrap(a);
      const here = idx(x, y);
      if (here >= 0) {
        if (out) {
          g.home[here] = Math.min(
            3,
            g.home[here]! + lay * Math.exp(-t / 400) * 0.5,
          );
        } else if (col.carry[i] !== 0) {
          g.food[here] = Math.min(3, g.food[here]! + lay * Math.exp(-t / 500));
        }
      }
    }

    // Crumbs that are empty and fully home are gone.
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const c = list[i]!;
      if (c.bits <= 0 && c.transit <= 0) {
        list.splice(i, 1);
        setSaid((v) => ({ n: v.n + 1, text: "Crumb carried home." }));
      }
    }

    // The scent evaporates everywhere and spreads a little.
    let peak = 0;
    const n = g.gw * g.gh;
    for (let i = 0; i < n; i += 1) {
      const f = g.food[i]! * keep;
      const hm = g.home[i]! * keep;
      g.food[i] = f < 0.004 ? 0 : f;
      g.home[i] = hm < 0.004 ? 0 : hm;
      if (f > peak) peak = f;
      if (hm > peak) peak = hm;
    }
    if (s.steps % 12 === 0) diffuse(g);
    g.peak = peak;
  };

  /** One light blur of the food scent, so a column reads as a band, not a thread. */
  const diffuse = (g: World) => {
    const { gw, gh, food, tmp } = g;
    tmp.set(food);
    for (let y = 1; y < gh - 1; y += 1) {
      for (let x = 1; x < gw - 1; x += 1) {
        const i = y * gw + x;
        const avg =
          (tmp[i - 1]! + tmp[i + 1]! + tmp[i - gw]! + tmp[i + gw]!) * 0.25;
        food[i] = tmp[i]! * 0.88 + avg * 0.12;
      }
    }
  };

  /**
   * Reduced motion: the shortest route from the nest to the scent (or the
   * nearest crumb) round every obstacle, found breadth-first on the grid and
   * smoothed, with the ants laid along it head to tail.
   */
  const layColumn = () => {
    const g = world.current;
    const col = colony.current;
    if (!g || !col) return;
    col.n = k.ants;
    g.food.fill(0);
    g.home.fill(0);
    for (let i = 0; i < col.n; i += 1) col.state[i] = 0;
    const p = path.current;
    p.n = 0;
    let tx = -1;
    let ty = -1;
    let crumb: Crumb | null = null;
    if (hand.current.present && k.enabled) {
      const at = nearestFree(sim.current.lx / g.cell, sim.current.ly / g.cell);
      tx = at.x;
      ty = at.y;
    } else {
      let best = Infinity;
      for (const c of crumbList.current) {
        if (c.bits <= 0) continue;
        const d = Math.hypot(c.x - g.nx, c.y - g.ny);
        if (d < best) {
          best = d;
          crumb = c;
        }
      }
      if (crumb) {
        tx = crumb.x;
        ty = crumb.y;
      }
    }
    if (tx < 0) {
      // Nothing to seek: a few ants keep guard round the mouth.
      const guards = Math.min(col.n, 6);
      for (let i = 0; i < guards; i += 1) {
        const a = (i / guards) * TAU + 0.4;
        col.state[i] = 2;
        col.carry[i] = 0;
        col.x[i] = g.nx + Math.cos(a) * 4;
        col.y[i] = g.ny + Math.sin(a) * 3;
        col.a[i] = a + Math.PI / 2;
      }
      return;
    }
    const { gw, gh, dist, queue, solid } = g;
    dist.fill(-1);
    const start = idx(tx, ty);
    if (start < 0) return;
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % gw;
      const y = (i - x) / gw;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const j = yy * gw + xx;
          if (solid[j] === 1 || dist[j]! >= 0) continue;
          dist[j] = dist[i]! + 1;
          queue[tail++] = j;
        }
      }
    }
    let cur = idx(g.nx, g.ny);
    if (cur < 0 || dist[cur]! < 0) return;
    const raw: number[] = [];
    while (cur >= 0 && raw.length < MAX_PATH * 2) {
      const x = cur % gw;
      const y = (cur - x) / gw;
      raw.push(x, y);
      if (dist[cur] === 0) break;
      let next = -1;
      let bestD = dist[cur]!;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
          const j = yy * gw + xx;
          const d = dist[j]!;
          // Equal steps are broken toward the target in a straight line, so
          // the route does not wander along the grid's diagonals.
          const score = d + Math.hypot(xx - tx, yy - ty) * 0.001;
          if (d >= 0 && score < bestD) {
            bestD = score;
            next = j;
          }
        }
      }
      cur = next;
    }
    // Pull the grid route taut: from each anchor, reach the furthest route
    // point still in plain sight, so the column runs straight and bends only
    // where an obstacle makes it.
    const total = raw.length / 2;
    const clear = (x0: number, y0: number, x1: number, y1: number) => {
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let j = 1; j < steps; j += 1) {
        const t = j / steps;
        if (!free(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
      }
      return true;
    };
    const corners: number[] = [raw[0]!, raw[1]!];
    let anchor = 0;
    while (anchor < total - 1) {
      let reach = anchor + 1;
      while (
        reach + 1 < total &&
        clear(
          raw[anchor * 2]!,
          raw[anchor * 2 + 1]!,
          raw[(reach + 1) * 2]!,
          raw[(reach + 1) * 2 + 1]!,
        )
      ) {
        reach += 1;
      }
      corners.push(raw[reach * 2]!, raw[reach * 2 + 1]!);
      anchor = reach;
    }
    // The taut route, resampled a cell apart.
    let m = 0;
    for (let c = 0; c + 3 < corners.length; c += 2) {
      const x0 = corners[c]!;
      const y0 = corners[c + 1]!;
      const x1 = corners[c + 2]!;
      const y1 = corners[c + 3]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let j = 0; j < steps && m < MAX_PATH; j += 1) {
        const t = j / steps;
        p.xy[m * 2] = x0 + (x1 - x0) * t;
        p.xy[m * 2 + 1] = y0 + (y1 - y0) * t;
        m += 1;
      }
    }
    p.n = m;
    for (let i = 0; i < m; i += 1) {
      const at = idx(p.xy[i * 2]!, p.xy[i * 2 + 1]!);
      if (at >= 0) g.food[at] = 1;
    }
    diffuse(g);
    diffuse(g);
    // Ants every three cells, alternating out and home; every other one
    // coming home from a crumb carries a bit.
    let placed = 0;
    for (let i = 2; i < m - 2 && placed < col.n; i += 3) {
      const x0 = p.xy[i * 2]!;
      const y0 = p.xy[i * 2 + 1]!;
      const x1 = p.xy[(i + 1) * 2]!;
      const y1 = p.xy[(i + 1) * 2 + 1]!;
      const homeward = placed % 2 === 1;
      col.state[placed] = homeward ? 2 : 1;
      col.carry[placed] = homeward && crumb && placed % 4 === 1 ? 1 : 0;
      col.x[placed] = x0 + (homeward ? 0.6 : -0.6) * -(y1 - y0);
      col.y[placed] = y0 + (homeward ? 0.6 : -0.6) * (x1 - x0);
      col.a[placed] = Math.atan2(y1 - y0, x1 - x0) + (homeward ? Math.PI : 0);
      placed += 1;
    }
  };

  const draw = () => {
    const g = world.current;
    const col = colony.current;
    const p = pal.current;
    const canvas = canvasRef.current;
    if (!g || !col || !p || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!k.motionSafe) layColumn();
    const d = g.img.data;
    d.fill(0);
    const { gw, gh } = g;
    const put = (x: number, y: number, c: Rgb, alpha: number) => {
      const cx = Math.round(x);
      const cy = Math.round(y);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return;
      const o = (cy * gw + cx) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = alpha;
    };
    // Scent, in four crisp steps rather than a smooth wash.
    const n = gw * gh;
    for (let i = 0; i < n; i += 1) {
      const v = g.food[i]! * 0.9;
      if (v < 0.12) continue;
      const level = Math.min(4, Math.floor(v * 5));
      if (level === 0) continue;
      const o = i * 4;
      d[o] = p.trail[0];
      d[o + 1] = p.trail[1];
      d[o + 2] = p.trail[2];
      d[o + 3] = 16 + level * 15;
    }
    for (let i = 0; i < n; i += 1) {
      const lk = g.look[i]!;
      if (!lk) continue;
      const o = i * 4;
      const c = lk === 2 ? p.earthLit : p.earth;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = lk === 3 ? 230 : lk === 2 ? 170 : 200;
    }
    // The nest: a dithered mound round a dark mouth; the rim flicks bright
    // when a bit comes home.
    const s = sim.current;
    for (let y = -5; y <= 5; y += 1) {
      for (let x = -6; x <= 6; x += 1) {
        const kind = nestCell(x, y);
        if (kind === 0) continue;
        const gx = g.nx + x;
        const gy = g.ny + y;
        const r = Math.hypot(x, y * 1.3);
        if (kind === 1) put(gx, gy, p.hole, 245);
        else if (kind === 2) {
          put(
            gx,
            gy,
            s.flash > 0.05 ? p.trail : p.earth,
            Math.round(190 + 60 * s.flash),
          );
        } else {
          put(
            gx,
            gy,
            kind === 3 ? p.earthLit : p.earth,
            Math.round(185 - r * 22),
          );
        }
      }
    }
    for (let i = 0; i < col.n; i += 1) {
      if (col.state[i] === 0) continue;
      const x = col.x[i]!;
      const y = col.y[i]!;
      const a = col.a[i]!;
      const hx = Math.round(x);
      const hy = Math.round(y);
      let tx = Math.round(x - Math.cos(a));
      let ty = Math.round(y - Math.sin(a));
      if (tx === hx && ty === hy) {
        tx = Math.round(x - Math.cos(a) * 1.6);
        ty = Math.round(y - Math.sin(a) * 1.6);
      }
      put(tx, ty, p.ant, 255);
      put(hx, hy, col.carry[i] === 1 ? p.crumbLit : p.ant, 255);
    }
    for (const c of crumbList.current) {
      const lift = Math.max(0, c.drop);
      // A crumb sits on the ants that work it, with a cell of shadow under
      // it so it reads as a thing on the ground.
      for (let b = 0; b < c.bits; b += 1) {
        put(
          c.x + c.layout[b * 2]! + 1,
          c.y + c.layout[b * 2 + 1]! + 1,
          p.ant,
          60,
        );
      }
      for (let b = 0; b < c.bits; b += 1) {
        const bx = c.x + c.layout[b * 2]!;
        const by = c.y + c.layout[b * 2 + 1]! - lift;
        put(bx, by, (b * 7) % 5 === 0 ? p.crumbLit : p.crumb, 255);
      }
      if (c.dust > 0.05) {
        const spread = 2 + (1 - c.dust) * 3;
        const alpha = Math.round(c.dust * 150);
        put(c.x - spread, c.y + 1, p.earth, alpha);
        put(c.x + spread, c.y + 1, p.earth, alpha);
        put(c.x - spread * 0.6, c.y + 2, p.earthLit, alpha);
        put(c.x + spread * 0.6, c.y + 2, p.earthLit, alpha);
      }
    }
    // The scent under the hand: a slow ring of eight dots.
    if (s.lure > 0.02 && k.enabled) {
      const cx = s.lx / g.cell;
      const cy = s.ly / g.cell;
      const turn = (s.steps * 0.012) % TAU;
      for (let i = 0; i < 8; i += 1) {
        const a = turn + (i / 8) * TAU;
        put(
          cx + Math.cos(a) * 4.5,
          cy + Math.sin(a) * 4.5,
          p.trail,
          Math.round(200 * s.lure),
        );
      }
    }
    g.offCtx.putImageData(g.img, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const px = g.cell * g.scale;
    ctx.drawImage(g.off, 0, 0, gw * px, gh * px);
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Steps the colony; says whether anything still lives. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const col = colony.current;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 4) {
      s.carry -= STEP;
      steps += 1;
      step();
    }
    if (steps === 4) s.carry = 0;
    let out = false;
    if (col) {
      for (let i = 0; i < col.n; i += 1) {
        if (col.state[i] !== 0) {
          out = true;
          break;
        }
      }
    }
    const g = world.current;
    const landing = crumbList.current.some(
      (c) => c.drop !== 0 || c.dropV !== 0 || c.dust > 0,
    );
    return (
      out ||
      landing ||
      s.lure > 0 ||
      s.flash > 0 ||
      hasTarget() ||
      Boolean(g && g.peak > 0)
    );
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden || !world.current) {
      s.last = 0;
      return;
    }
    if (!k.motionSafe || k.paused) {
      s.last = 0;
      draw();
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : STEP;
    s.last = now;
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** Reduced motion: a crumb on the column loses a bit a second to the nest. */
  const sync = () => {
    window.clearTimeout(reducedTimer.current);
    reducedTimer.current = 0;
    if (k.motionSafe || k.paused || !visible.current || document.hidden) return;
    const list = crumbList.current;
    if (!list.some((c) => c.bits > 0)) return;
    reducedTimer.current = window.setTimeout(() => {
      reducedTimer.current = 0;
      // The crumb the still column runs to: the nearest to the nest, and
      // none while the scent holds the column elsewhere.
      const g = world.current;
      let target: Crumb | null = null;
      let best = Infinity;
      if (g && !(hand.current.present && k.enabled)) {
        for (const c of crumbList.current) {
          const d = Math.hypot(c.x - g.nx, c.y - g.ny);
          if (c.bits > 0 && d < best) {
            best = d;
            target = c;
          }
        }
      }
      if (target) {
        target.bits -= 1;
        sim.current.stored += 1;
        report.current.onCarry?.(sim.current.stored);
        if (target.bits <= 0) {
          crumbList.current = crumbList.current.filter((c) => c !== target);
          setSaid((v) => ({ n: v.n + 1, text: "Crumb carried home." }));
        }
      }
      api.current?.draw();
      api.current?.sync();
    }, 900);
  };

  React.useLayoutEffect(() => {
    api.current = { rebuild, readColours, draw, kick, tick, sync };
    report.current = { onCarry, onCrumb };
  });

  React.useEffect(() => {
    // The seed's wander and the crumbs on the ground start afresh together.
    rand.current = lcg(seed);
    colony.current = allocColony();
    crumbList.current = [];
    sim.current.warmed = false;
    sim.current.stored = 0;
    for (const c of crumbs) placeCrumb(clamp01(c.x), clamp01(c.y), false);
    api.current?.rebuild();
    api.current?.sync();
    // crumbs is read through crumbKey; a new array with the same places
    // keeps the colony running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, crumbKey]);

  React.useEffect(() => {
    api.current?.rebuild();
  }, [k.pixel, k.dpr, k.nx, k.ny, pebbleKey, k.avoid]);

  React.useEffect(() => {
    if (!world.current) return;
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
    api.current?.sync();
  }, [
    k.ants,
    k.pheromone,
    k.speed,
    k.wander,
    k.bits,
    paused,
    motionSafe,
    k.enabled,
  ]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
      api.current?.sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const timer = reducedTimer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      window.clearTimeout(timer.current);
      timer.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const observer = new ResizeObserver(() => api.current?.rebuild());
    sizer.current = observer;
    observer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.draw();
      api.current?.kick();
      api.current?.sync();
    });
    watcher.observe(node);
    return () => {
      observer.disconnect();
      watcher.disconnect();
      sizer.current = null;
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return { x: 0, y: 0 };
    return {
      x: clamp(clientX - r.left - root.clientLeft, 0, root.clientWidth),
      y: clamp(clientY - r.top - root.clientTop, 0, root.clientHeight),
    };
  };

  const handTo = (x: number, y: number, source: "pointer" | "key") => {
    const hd = hand.current;
    const fresh = !hd.present;
    hd.x = x;
    hd.y = y;
    hd.present = true;
    hd.placed = true;
    hd.source = source;
    // A scent arriving from nowhere starts under the hand.
    if (fresh && sim.current.lure < 0.05) {
      sim.current.lx = x;
      sim.current.ly = y;
      sim.current.lvx = 0;
      sim.current.lvy = 0;
    }
    if (!k.motionSafe) {
      sim.current.lx = x;
      sim.current.ly = y;
      sim.current.lure = 1;
    }
    kick();
  };

  const handLeave = () => {
    const hd = hand.current;
    hd.present = false;
    hd.source = null;
    if (!k.motionSafe) sim.current.lure = 0;
    kick();
  };

  /** A crumb at (x, y), in px from the box's top left. */
  const dropCrumb = (x: number, y: number) => {
    const g = world.current;
    if (!k.enabled || !g) return;
    const c = placeCrumb(x / g.w, y / g.h, k.motionSafe);
    report.current.onCrumb?.(
      Math.round(c.x * g.cell),
      Math.round(c.y * g.cell),
    );
    setSaid((v) => ({ n: v.n + 1, text: "Crumb dropped." }));
    draw();
    kick();
    sync();
  };

  const drag = useDrag({
    threshold: 6,
    disabled: !k.enabled,
    onStart: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
    },
    onMove: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "mouse") handLeave();
    },
    onCancel: () => handLeave(),
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      dropCrumb(at.x, at.y);
    },
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  /** Where the keyboard's scent starts: a free spot right of middle. */
  const keyHome = () => {
    const g = world.current;
    if (!g) return { x: 0, y: 0 };
    const at = nearestFree(g.gw * 0.62, g.gh * 0.42);
    return { x: at.x * g.cell, y: at.y * g.cell };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const g = world.current;
    if (!k.enabled || !g) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    const hd = hand.current;
    if (move) {
      event.preventDefault();
      const from = hd.present ? { x: hd.x, y: hd.y } : keyHome();
      const by = event.shiftKey ? 48 : 16;
      handTo(
        clamp(from.x + move[0] * by, g.cell * 3, g.w - g.cell * 3),
        clamp(from.y + move[1] * by, g.cell * 3, g.h - g.cell * 3),
        "key",
      );
      return;
    }
    if (event.key === "Escape" && hd.present && hd.source === "key") {
      event.preventDefault();
      handLeave();
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (!k.enabled || !event.currentTarget.matches(":focus-visible")) return;
    const hd = hand.current;
    const at =
      hd.placed && hd.source !== "pointer" ? { x: hd.x, y: hd.y } : keyHome();
    handTo(at.x, at.y, "key");
  };

  const onBlur = () => {
    if (hand.current.source === "key") handLeave();
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!k.enabled || fromContent(event.target)) return;
        drag.onPointerDown(event);
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType !== "mouse" || !k.enabled) return;
        const at = local(event.clientX, event.clientY);
        handTo(at.x, at.y, "pointer");
      }}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== "touch" &&
          hand.current.source === "pointer"
        ) {
          handLeave();
        }
      }}
      className={cn(
        "group/ant-column relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <ColonyStill
        nest={{ x: k.nx, y: k.ny }}
        crumb={crumbs[0] ?? null}
        pebbles={obstacles}
        pixel={k.pixel}
        bits={k.bits}
        seed={seed}
        antColor={antColor}
        crumbColor={crumbColor}
        earthColor={earthColor}
        trailColor={trailColor}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <button
        type="button"
        data-ants=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it drops a crumb at the scent.
          if (event.detail !== 0) return;
          const hd = hand.current;
          const at = hd.present ? { x: hd.x, y: hd.y } : keyHome();
          dropCrumb(at.x, at.y);
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-crosshair" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys move a scent the ants follow; Enter or Space drops a crumb
        there for them to carry home; Escape lifts the scent.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the mound,
 * the pebbles, a crumb and a column of ants on a gentle arc between them.
 * Each cluster is a nested SVG placed by percentage, its cells in px, so the
 * still keeps its pixel size in any box.
 */
function ColonyStill({
  nest,
  crumb,
  pebbles,
  pixel,
  bits,
  seed,
  antColor,
  crumbColor,
  earthColor,
  trailColor,
}: {
  nest: AntColumnPoint;
  crumb: AntColumnPoint | null;
  pebbles: readonly AntColumnPebble[];
  pixel: number;
  bits: number;
  seed: number;
  antColor: string;
  crumbColor: string;
  earthColor: string;
  trailColor: string;
}) {
  const art = React.useMemo(() => {
    const cellsPath = (cells: [number, number][]) =>
      cells
        .map(
          ([x, y]) => `M${x * pixel} ${y * pixel}h${pixel}v${pixel}h${-pixel}Z`,
        )
        .join("");
    const mound: [number, number][] = [];
    const mouth: [number, number][] = [];
    for (let y = -5; y <= 5; y += 1) {
      for (let x = -6; x <= 6; x += 1) {
        const kind = nestCell(x, y);
        if (kind === 1) mouth.push([x, y]);
        else if (kind !== 0) mound.push([x, y]);
      }
    }
    const stones = pebbles.map((o) => {
      const r = Math.max(1, o.size / pixel);
      const cells: [number, number][] = [];
      for (let y = Math.floor(-r); y <= Math.ceil(r); y += 1) {
        for (let x = Math.floor(-r); x <= Math.ceil(r); x += 1) {
          if (Math.hypot(x, y * 1.2) <= r) cells.push([x, y]);
        }
      }
      return { x: r2(o.x * 100), y: r2(o.y * 100), d: cellsPath(cells) };
    });
    const rand = lcg(seed);
    const crumbCells: [number, number][] = [];
    const layout = crumbLayout(bits, rand);
    for (let i = 0; i < bits; i += 1) {
      crumbCells.push([layout[i * 2]!, layout[i * 2 + 1]!]);
    }
    const ants: { x: number; y: number; d: string }[] = [];
    if (crumb) {
      // A gentle arc from the mouth to the crumb, bowed upward.
      const count = 26;
      for (let i = 1; i < count; i += 1) {
        const t = i / count;
        const bow = Math.sin(t * Math.PI) * 0.16;
        const x = nest.x + (crumb.x - nest.x) * t;
        const y = nest.y + (crumb.y - nest.y) * t - bow;
        const t2 = Math.min(1, t + 0.02);
        const x2 = nest.x + (crumb.x - nest.x) * t2;
        const y2 =
          nest.y + (crumb.y - nest.y) * t2 - Math.sin(t2 * Math.PI) * 0.16;
        const a = Math.atan2((y2 - y) * 0.3, x2 - x);
        const dx = Math.round(Math.cos(a));
        const dy = Math.round(Math.sin(a));
        const tail = dx === 0 && dy === 0 ? [-1, 0] : [-dx, -dy];
        ants.push({
          x: r2(x * 100 + (rand() - 0.5) * 1.2),
          y: r2(y * 100 + (rand() - 0.5) * 3),
          d: cellsPath([
            [0, 0],
            [tail[0] ?? -1, tail[1] ?? 0],
          ]),
        });
      }
    }
    return {
      mound: cellsPath(mound),
      mouth: cellsPath(mouth),
      stones,
      crumb: cellsPath(crumbCells),
      ants,
    };
  }, [pebbles, pixel, bits, seed, crumb, nest.x, nest.y]);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/ant-column:opacity-0"
    >
      {art.stones.map((s, i) => (
        <svg key={i} x={`${s.x}%`} y={`${s.y}%`} overflow="visible">
          <path d={s.d} style={{ fill: earthColor }} fillOpacity={0.8} />
        </svg>
      ))}
      <svg
        x={`${r2(nest.x * 100)}%`}
        y={`${r2(nest.y * 100)}%`}
        overflow="visible"
      >
        <path d={art.mound} style={{ fill: earthColor }} fillOpacity={0.55} />
        <path
          d={art.mouth}
          style={{ fill: `color-mix(in oklab, ${earthColor} 30%, black)` }}
        />
      </svg>
      {crumb ? (
        <svg
          x={`${r2(crumb.x * 100)}%`}
          y={`${r2(crumb.y * 100)}%`}
          overflow="visible"
        >
          <path d={art.crumb} style={{ fill: crumbColor }} />
        </svg>
      ) : null}
      <g style={{ fill: antColor }}>
        {art.ants.map((a, i) => (
          <svg key={i} x={`${a.x}%`} y={`${a.y}%`} overflow="visible">
            <path d={a.d} />
          </svg>
        ))}
      </g>
      <g style={{ fill: trailColor }} fillOpacity={0.25}>
        {art.ants.map((a, i) =>
          i % 3 === 0 ? (
            <svg key={i} x={`${a.x}%`} y={`${a.y}%`} overflow="visible">
              <path
                d={`M${-pixel * 3} ${pixel}h${pixel}v${pixel}h${-pixel}Z`}
              />
            </svg>
          ) : null,
        )}
      </g>
    </svg>
  );
}
