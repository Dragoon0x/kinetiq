"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DendriteReachStain = "green" | "magenta" | "cyan" | "amber";
export type DendriteReachCause = "spontaneous" | "signal" | "stimulus";

export type DendriteReachProps = {
  /** How bushy the dendrites grow, 0 (long and sparse) to 1 (densely branched). @default 0.5 */
  branching?: number;
  /** Spontaneous firings per cell per second (0 to 2); 0 leaves the cells quiet until stimulated. @default 0.3 */
  pulse?: number;
  /** The fluorescent stain: a named one, or any CSS colour. @default "green" */
  stain?: DendriteReachStain | (string & {});
  /** How many cells (1 to 8); 0 picks one per ~190 px of width. @default 0 */
  cells?: number;
  /** How fast a growth cone advances, px/s (4 to 60). @default 16 */
  growth?: number;
  /** Length budget of each cell's tree, 0.4 to 2. @default 1 */
  reach?: number;
  /** Chance that two meeting dendrites form a junction rather than pull apart, 0 to 1. @default 0.6 */
  junctions?: number;
  /** How strongly tips grow toward the pointer's cue, 0 to 1. @default 0.6 */
  cue?: number;
  /** How far the cue reaches, px. @default 150 */
  cueRadius?: number;
  /** The field behind the cells, any CSS colour. Dark in both themes, as fluorescence is. @default "oklch(from var(--accent) 0.135 0.02 h)" */
  background?: string;
  /** The pointer and the keys offer a cue and stimulate. @default true */
  interactive?: boolean;
  /** Holds growth and signals where they are. @default false */
  paused?: boolean;
  /** Seeds the culture; a new seed grows a new one. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A cell fired, with its index and why: on its own, passed a signal across a junction, or stimulated by the visitor. */
  onFire?: (cell: number, cause: DendriteReachCause) => void;
  /** The number of junctions, reported from the start and on each new one. */
  onJunctionsChange?: (count: number) => void;
  /** The culture's name. @default "Neuron culture" */
  label?: string;
  /** No cue, no stimulation; the culture grows on and says it is disabled. @default false */
  disabled?: boolean;
  /** Sizes and shapes the field. @default "h-56 w-full" */
  className?: string;
};

/**
 * Named stains are pigments at fixed lightness taken from the theme's hues,
 * so the cells glow the same on a light page and a dark one.
 */
const STAINS: Record<DendriteReachStain, string> = {
  green: "oklch(from var(--success) 0.84 0.17 calc(h - 14))",
  magenta: "oklch(from var(--danger) 0.74 0.2 calc(h - 55))",
  cyan: "oklch(from var(--accent-bright) 0.84 0.12 calc(h - 52))",
  amber: "oklch(from var(--warn) 0.84 0.15 calc(h - 8))",
};
const DEFAULT_BACKGROUND = "oklch(from var(--accent) 0.135 0.02 h)";
/** The scale bar sits on the field, which is dark in both themes. */
const BAR_INK = "oklch(from var(--accent-bright) 0.92 0.02 h / 0.7)";

const PULSE_SPEED = 170;
const SYNAPSE_DELAY = 0.12;
const REFRACTORY = 2.2;
const SUB = 1 / 240;
const BUCKET = 16;
const POINT_STEP = 3;
const MAX_ORDER = 5;
const UNBAKED = 36;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Branch = {
  cell: number;
  parent: number;
  /** Path distance from the soma where this branch starts. */
  s0: number;
  xs: number[];
  ys: number[];
  /** Cumulative length along the branch at each point. */
  ls: number[];
  order: number;
  width: number;
  alive: boolean;
  heading: number;
  phase: number;
  untilSplit: number;
  baked: number;
  retract: number;
  turnAfter: number;
  /** Children: where along this branch each forks off, and which. */
  forks: { at: number; branch: number }[];
  lunge: {
    fx: number;
    fy: number;
    tx: number;
    ty: number;
    p: number;
    v: number;
  } | null;
};

type Cell = {
  x: number;
  y: number;
  r: number;
  budget: number;
  used: number;
  flash: number;
  refractory: number;
  waves: number[];
  reach: number;
  nextFire: number;
};

type Junction = {
  a: number;
  da: number;
  b: number;
  db: number;
  ba: number;
  bb: number;
  x: number;
  y: number;
  r: number;
  v: number;
  flash: number;
};

type Inward = { cell: number; branch: number; from: number; t0: number };

type Config = {
  branching: number;
  pulse: number;
  cells: number;
  growth: number;
  reach: number;
  junctions: number;
  cue: number;
  cueRadius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
};

type Events = {
  fire: (cell: number, cause: DendriteReachCause) => void;
  junction: (count: number, a: number, b: number, announce: boolean) => void;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  setCue: (x: number, y: number) => void;
  nudgeCue: (dx: number, dy: number) => void;
  clearCue: () => boolean;
  stimulate: () => void;
  stimulateAt: (x: number, y: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
  events: React.RefObject<Events>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let sleepTimer = 0;
  let last = 0;
  let clock = 0;
  let disposed = false;
  let stain = "white";
  let core = "white";
  let field = "black";
  let nucleus = "black";
  const backdrop = document.createElement("canvas");
  const tree = document.createElement("canvas");
  const glow = document.createElement("canvas");
  let treeCtx: CanvasRenderingContext2D | null = null;
  let rand = lcg(5);
  let cells: Cell[] = [];
  let branches: Branch[] = [];
  let junctions: Junction[] = [];
  let inward: Inward[] = [];
  let hashMap = new Map<number, number[]>();
  let growing = false;
  const tipsPerCell = new Int32Array(8);
  // The cue: where the pointer or the keys offer growth factor.
  const cue = { x: 0, y: 0, on: false, strength: 0 };
  // Reduced motion: a crossfaded glow over a stimulated network.
  let stillGlow = 0;
  let stillGlowTarget = 0;
  let stillHold = 0;
  let stillLit: Set<number> = new Set();

  const read = (k: number, fallback: string) => {
    const el = carriers[k];
    return el ? getComputedStyle(el).color || fallback : fallback;
  };

  const readColours = () => {
    stain = read(0, stain);
    core = read(1, core);
    field = read(2, field);
    nucleus = read(3, nucleus);
    buildBackdrop();
    buildGlow();
    rebake();
  };

  /** The field: dark ground, out-of-focus blobs of stain, grain, a vignette. */
  const buildBackdrop = () => {
    const c = cfg;
    if (!c || w < 1) return;
    backdrop.width = Math.max(1, Math.round(w * dpr));
    backdrop.height = Math.max(1, Math.round(h * dpr));
    const g = backdrop.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = field;
    g.fillRect(0, 0, w, h);
    const r = lcg(c.seed * 61 + 7);
    const blobs = 5 + Math.round(w / 160);
    for (let i = 0; i < blobs; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const radius = 30 + r() * 90;
      const grad = g.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, stain);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.04 + r() * 0.05;
      g.fillStyle = grad;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    g.fillStyle = stain;
    const grains = Math.round((w * h) / 70);
    for (let i = 0; i < grains; i += 1) {
      g.globalAlpha = 0.03 + r() * 0.06;
      g.fillRect(r() * w, r() * h, 0.8, 0.8);
    }
    g.globalAlpha = 1;
    const vignette = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.6,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.42)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, w, h);
  };

  /** A soft light: white-hot core, the stain, then nothing. */
  const buildGlow = () => {
    const size = Math.max(8, Math.round(64 * dpr));
    glow.width = size;
    glow.height = size;
    const g = glow.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, size, size);
    const grad = g.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, core);
    grad.addColorStop(0.18, stain);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  };

  const hashAdd = (b: number, i: number) => {
    const br = branches[b];
    if (!br) return;
    const x = br.xs[i] ?? 0;
    const y = br.ys[i] ?? 0;
    const key = Math.floor(x / BUCKET) * 4096 + Math.floor(y / BUCKET);
    const list = hashMap.get(key);
    const ref = b * 65536 + i;
    if (list) list.push(ref);
    else hashMap.set(key, [ref]);
  };

  const newBranch = (
    cell: number,
    parent: number,
    s0: number,
    x: number,
    y: number,
    heading: number,
    order: number,
  ) => {
    const c = cfg;
    const b: Branch = {
      cell,
      parent,
      s0,
      xs: [x],
      ys: [y],
      ls: [0],
      order,
      width: Math.max(0.55, 2.3 * Math.pow(0.74, order)),
      alive: true,
      heading,
      phase: rand() * 100,
      untilSplit: splitGap(c),
      baked: 0,
      retract: 0,
      turnAfter: 0,
      forks: [],
      lunge: null,
    };
    branches.push(b);
    return branches.length - 1;
  };

  const splitGap = (c: Config | null) =>
    (44 / (0.2 + clamp(c?.branching ?? 0.5, 0, 1))) * (0.55 + rand() * 0.9);

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    tree.width = canvas.width;
    tree.height = canvas.height;
    treeCtx = tree.getContext("2d");
    buildBackdrop();
    buildGlow();
    culture();
  };

  /** Plants a fresh culture: the cells, their first dendrites. */
  const culture = () => {
    const c = cfg;
    if (!c) return;
    rand = lcg(c.seed * 977 + 31);
    branches = [];
    junctions = [];
    inward = [];
    hashMap = new Map();
    cells = [];
    clock = 0;
    const count =
      c.cells > 0
        ? clamp(Math.round(c.cells), 1, 8)
        : clamp(Math.round(w / 190), 2, 6);
    const area = (w * h) / count;
    // Spread along the width with a little seeded scatter, so each cell has
    // its own room and neighbours meet across the gaps.
    for (let i = 0; i < count; i += 1) {
      const slot = w / count;
      const x = slot * (i + 0.5) + (rand() - 0.5) * slot * 0.36;
      const y = h * (0.3 + rand() * 0.4);
      cells.push({
        x: clamp(x, 24, w - 24),
        y: clamp(y, 24, h - 24),
        r: 5.5 + rand() * 2.5,
        budget: clamp(c.reach, 0.4, 2) * Math.sqrt(area) * 5.6,
        used: 0,
        flash: 0,
        refractory: 0,
        waves: [],
        reach: 0,
        nextFire: 0,
      });
    }
    cells.forEach((cell, i) => {
      const roots = 4 + Math.floor(rand() * 3);
      const turn = rand() * Math.PI * 2;
      for (let k = 0; k < roots; k += 1) {
        const a = turn + (k / roots) * Math.PI * 2 + (rand() - 0.5) * 0.5;
        newBranch(
          i,
          -1,
          cell.r,
          cell.x + Math.cos(a) * cell.r,
          cell.y + Math.sin(a) * cell.r,
          a,
          0,
        );
      }
      cell.nextFire = nextGap(c);
    });
    treeCtx?.clearRect(0, 0, tree.width, tree.height);
    growing = true;
    stillGlow = 0;
    stillGlowTarget = 0;
    events.current.junction(0, -1, -1, false);
    if (!c.motionSafe) {
      // Reduced motion: grown in one go, drawn once, a still micrograph.
      let guard = 0;
      while (growing && guard < 6000) {
        grow(1 / 30, true);
        guard += 1;
      }
      for (const b of branches) b.lunge = null;
      for (const j of junctions) {
        j.r = 3.2;
        j.v = 0;
      }
      bakeAll();
    } else {
      // Light it for a moment so the first frame already reaches out.
      for (let k = 0; k < 240; k += 1) grow(1 / 30, true);
    }
  };

  const nextGap = (c: Config) => {
    const rate = clamp(c.pulse, 0, 2);
    if (rate <= 0) return Number.POSITIVE_INFINITY;
    return clock + -Math.log(1 - rand() * 0.98) / rate + 0.4;
  };

  const bakeSegment = (b: Branch, from: number, to: number) => {
    const g = treeCtx;
    if (!g || to <= from) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Opaque cores over a faint halo, laid with source-over: where one baked
    // stretch meets the next, nothing doubles up into a bead.
    g.globalCompositeOperation = "source-over";
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = stain;
    for (const [width, alpha] of [
      [b.width * 3.4, 0.07],
      [b.width, 0.86],
    ] as const) {
      g.globalAlpha = alpha;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(b.xs[from] ?? 0, b.ys[from] ?? 0);
      for (let i = from + 1; i <= to; i += 1)
        g.lineTo(b.xs[i] ?? 0, b.ys[i] ?? 0);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  };

  const bakeAll = () => {
    for (const b of branches) {
      const end = b.xs.length - 1;
      if (end > b.baked) {
        bakeSegment(b, b.baked, end);
        b.baked = end;
      }
    }
  };

  const rebake = () => {
    if (!treeCtx) return;
    treeCtx.setTransform(1, 0, 0, 1, 0, 0);
    treeCtx.clearRect(0, 0, tree.width, tree.height);
    for (const b of branches) {
      if (b.baked > 0) bakeSegment(b, 0, b.baked);
    }
  };

  /** The nearest point of another cell's dendrite within reach of a tip. */
  const meet = (bi: number, x: number, y: number) => {
    const me = branches[bi];
    if (!me) return null;
    const gx = Math.floor(x / BUCKET);
    const gy = Math.floor(y / BUCKET);
    let best: { b: number; i: number; d: number } | null = null;
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        const list = hashMap.get((gx + ox) * 4096 + (gy + oy));
        if (!list) continue;
        for (const ref of list) {
          const b = Math.floor(ref / 65536);
          const i = ref % 65536;
          const other = branches[b];
          if (!other || other.cell === me.cell || i >= other.xs.length)
            continue;
          const d = Math.hypot((other.xs[i] ?? 0) - x, (other.ys[i] ?? 0) - y);
          if (d < 6.5 && (!best || d < best.d)) best = { b, i, d };
        }
      }
    }
    return best;
  };

  const pairCount = (a: number, b: number) => {
    let n = 0;
    for (const j of junctions) {
      const ca = branches[j.ba]?.cell;
      const cb = branches[j.bb]?.cell;
      if ((ca === a && cb === b) || (ca === b && cb === a)) n += 1;
    }
    return n;
  };

  /** One step of growth for every live tip. */
  const grow = (dt: number, quiet: boolean) => {
    const c = cfg;
    if (!c) return;
    let alive = 0;
    tipsPerCell.fill(0);
    for (const b of branches) {
      if (b.alive) tipsPerCell[b.cell] = (tipsPerCell[b.cell] ?? 0) + 1;
    }
    const count = branches.length;
    for (let bi = 0; bi < count; bi += 1) {
      const b = branches[bi];
      if (!b || !b.alive) continue;
      alive += 1;
      const cell = cells[b.cell];
      if (!cell) continue;
      let n = b.xs.length - 1;
      let x = b.xs[n] ?? 0;
      let y = b.ys[n] ?? 0;
      if (b.retract > 0) {
        // Pull back along its own path, quickly at first, then easing.
        const speed = Math.max(24, b.retract * 7);
        let left = Math.min(b.retract, speed * dt);
        b.retract -= left;
        while (left > 0 && n > b.baked) {
          const px = b.xs[n - 1] ?? x;
          const py = b.ys[n - 1] ?? y;
          const seg = Math.hypot(x - px, y - py);
          if (seg <= left) {
            b.xs.pop();
            b.ys.pop();
            b.ls.pop();
            cell.used = Math.max(0, cell.used - seg);
            left -= seg;
            n -= 1;
            x = px;
            y = py;
          } else {
            const f = (seg - left) / seg;
            b.xs[n] = px + (x - px) * f;
            b.ys[n] = py + (y - py) * f;
            b.ls[n] = (b.ls[n - 1] ?? 0) + seg - left;
            cell.used = Math.max(0, cell.used - left);
            left = 0;
          }
        }
        if (b.retract <= 0 || n <= b.baked) {
          b.retract = 0;
          b.heading += b.turnAfter;
        }
        continue;
      }
      // Steering is a curvature — radians per pixel grown — so a slow tip
      // and a fast one draw the same gentle line: a wander on the tip's own
      // length, a pull outward from its soma, and toward the cue. A tip that
      // reaches the edge simply grows on out of the field of view.
      const tips = tipsPerCell[b.cell] ?? 1;
      const growth = clamp(c.growth, 4, 60);
      let boost = 1;
      const grown = b.s0 + (b.ls[n] ?? 0);
      const wander =
        Math.sin(grown * 0.045 + b.phase) * 0.7 +
        Math.sin(grown * 0.11 + b.phase * 2.3) * 0.3;
      let curve = wander * 0.022;
      const out = Math.atan2(y - cell.y, x - cell.x);
      curve += angleTo(b.heading, out) * 0.006;
      if (cue.on && cue.strength > 0.01) {
        const d = Math.hypot(cue.x - x, cue.y - y);
        const radius = Math.max(20, c.cueRadius);
        if (d < radius) {
          const pull = clamp(c.cue, 0, 1) * cue.strength * (1 - d / radius);
          curve +=
            angleTo(b.heading, Math.atan2(cue.y - y, cue.x - x)) * pull * 0.08;
          boost += pull * 0.9;
        }
      }
      const speed = clamp((growth * 3) / tips, growth * 0.3, growth) * boost;
      const stepLen = speed * dt;
      b.heading += curve * stepLen;
      x += Math.cos(b.heading) * stepLen;
      y += Math.sin(b.heading) * stepLen;
      cell.used += stepLen;
      b.untilSplit -= stepLen;
      const lastX = b.xs[n - 1] ?? b.xs[0] ?? x;
      const lastY = b.ys[n - 1] ?? b.ys[0] ?? y;
      const sinceLast = n > 0 ? Math.hypot(x - lastX, y - lastY) : POINT_STEP;
      if (n === 0 || sinceLast >= POINT_STEP) {
        b.xs.push(x);
        b.ys.push(y);
        b.ls.push(
          (b.ls[n] ?? 0) + Math.hypot(x - (b.xs[n] ?? x), y - (b.ys[n] ?? y)),
        );
        hashAdd(bi, b.xs.length - 1);
        n += 1;
      } else {
        b.xs[n] = x;
        b.ys[n] = y;
        b.ls[n] = (b.ls[n - 1] ?? 0) + sinceLast;
      }
      const reachNow = b.s0 + (b.ls[n] ?? 0);
      if (reachNow > cell.reach) cell.reach = reachNow;
      if (
        x < -8 ||
        x > w + 8 ||
        y < -8 ||
        y > h + 8 ||
        cell.used > cell.budget
      ) {
        b.alive = false;
        continue;
      }
      // Meeting another cell.
      const hit = meet(bi, x, y);
      if (hit) {
        const other = branches[hit.b];
        if (!other) continue;
        const already = pairCount(b.cell, other.cell);
        if (already < 2 && rand() < clamp(c.junctions, 0, 1)) {
          const tx = other.xs[hit.i] ?? x;
          const ty = other.ys[hit.i] ?? y;
          b.alive = false;
          b.lunge =
            c.motionSafe && !quiet
              ? { fx: x, fy: y, tx, ty, p: 0, v: 0 }
              : null;
          b.xs[n] = tx;
          b.ys[n] = ty;
          const j: Junction = {
            a: b.cell,
            da: b.s0 + (b.ls[n] ?? 0),
            b: other.cell,
            db: other.s0 + (other.ls[hit.i] ?? 0),
            ba: bi,
            bb: hit.b,
            x: tx,
            y: ty,
            r: c.motionSafe && !quiet ? 0 : 3.2,
            v: 0,
            flash: quiet ? 0 : 1,
          };
          junctions.push(j);
          events.current.junction(junctions.length, b.cell, other.cell, !quiet);
        } else {
          // Pull apart: retract, then turn away from the meeting.
          b.retract = 18 + rand() * 12;
          b.turnAfter = (rand() < 0.5 ? -1 : 1) * (1 + rand() * 0.7);
        }
        continue;
      }
      if (
        b.untilSplit <= 0 &&
        b.order < MAX_ORDER &&
        cell.used < cell.budget * 0.92
      ) {
        b.untilSplit = splitGap(c);
        const spread = 0.44 + rand() * 0.26;
        const side = rand() < 0.5 ? -1 : 1;
        const child = newBranch(
          b.cell,
          bi,
          reachNow,
          x,
          y,
          b.heading + side * spread,
          b.order + 1,
        );
        b.forks.push({ at: b.ls[n] ?? 0, branch: child });
        b.heading -= side * spread * 0.4;
        b.order = Math.min(MAX_ORDER, b.order + 0.5);
        b.width = Math.max(0.55, b.width * 0.9);
      }
      // Bake all but the live end, which may still retract.
      const end = b.xs.length - 1;
      const tail = (b.ls[end] ?? 0) - (b.ls[b.baked] ?? 0);
      if (tail > UNBAKED * 1.6) {
        let k = b.baked;
        while (k < end && (b.ls[end] ?? 0) - (b.ls[k] ?? 0) > UNBAKED) k += 1;
        bakeSegment(b, b.baked, k);
        b.baked = k;
      }
    }
    for (const b of branches) {
      if (!b.alive && !b.lunge && b.retract <= 0 && b.baked < b.xs.length - 1) {
        bakeSegment(b, b.baked, b.xs.length - 1);
        b.baked = b.xs.length - 1;
      }
    }
    if (alive === 0) growing = false;
  };

  const angleTo = (from: number, to: number) => {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /** A point at path distance `d` from the soma, walking up from branch `bi`. */
  const pointAt = (bi: number, d: number, out: { x: number; y: number }) => {
    let b = branches[bi];
    let guard = 0;
    while (b && d < b.s0 && b.parent >= 0 && guard < 12) {
      b = branches[b.parent];
      guard += 1;
    }
    if (!b) return false;
    const local = d - b.s0;
    const ls = b.ls;
    const n = ls.length - 1;
    if (local < 0) {
      const cell = cells[b.cell];
      if (!cell) return false;
      out.x = cell.x;
      out.y = cell.y;
      return true;
    }
    if (local > (ls[n] ?? 0)) return false;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((ls[mid] ?? 0) < local) lo = mid;
      else hi = mid;
    }
    const a = ls[lo] ?? 0;
    const span = (ls[hi] ?? a) - a || 1;
    const f = clamp((local - a) / span, 0, 1);
    out.x = (b.xs[lo] ?? 0) + ((b.xs[hi] ?? 0) - (b.xs[lo] ?? 0)) * f;
    out.y = (b.ys[lo] ?? 0) + ((b.ys[hi] ?? 0) - (b.ys[lo] ?? 0)) * f;
    return true;
  };

  const fire = (i: number, cause: DendriteReachCause) => {
    const c = cfg;
    const cell = cells[i];
    if (!c || !cell) return;
    if (clock < cell.refractory) return;
    cell.refractory = clock + REFRACTORY;
    cell.flash = 1;
    if (cell.waves.length < 3) cell.waves.push(clock);
    cell.nextFire = Math.max(cell.nextFire, nextGap(c));
    events.current.fire(i, cause);
  };

  /** Signals: waves out from firing cells, across junctions, in to partners. */
  const signal = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const prev = clock - dt;
    cells.forEach((cell, i) => {
      cell.flash *= Math.exp(-dt / 0.6);
      if (clock >= cell.nextFire) {
        cell.nextFire = nextGap(c);
        fire(i, "spontaneous");
      }
      for (let k = cell.waves.length - 1; k >= 0; k -= 1) {
        const t0 = cell.waves[k] ?? 0;
        const d = (clock - t0) * PULSE_SPEED;
        const dPrev = (prev - t0) * PULSE_SPEED;
        for (const j of junctions) {
          const mine = j.a === i ? j.da : j.b === i ? j.db : -1;
          if (mine < 0 || !(dPrev < mine && d >= mine)) continue;
          j.flash = 1;
          const partner = j.a === i ? j.b : j.a;
          inward.push({
            cell: partner,
            branch: j.a === i ? j.bb : j.ba,
            from: j.a === i ? j.db : j.da,
            t0: clock + SYNAPSE_DELAY,
          });
        }
        if (d > cell.reach + 30) cell.waves.splice(k, 1);
      }
    });
    for (let k = inward.length - 1; k >= 0; k -= 1) {
      const p = inward[k];
      if (!p || clock < p.t0) continue;
      const d = p.from - (clock - p.t0) * PULSE_SPEED;
      if (d <= (cells[p.cell]?.r ?? 0)) {
        inward.splice(k, 1);
        fire(p.cell, "signal");
      }
    }
    for (const j of junctions) {
      j.flash *= Math.exp(-dt / 0.35);
      if (c.motionSafe) {
        const s = springs.recoil;
        let left = dt;
        while (left > 0) {
          const step = Math.min(SUB, left);
          left -= step;
          j.v +=
            ((-s.stiffness * (j.r - 3.2) - s.damping * j.v) / s.mass) * step;
          j.r += j.v * step;
        }
      }
    }
    for (const b of branches) {
      const l = b.lunge;
      if (!l) continue;
      const s = springs.snap;
      let left = dt;
      while (left > 0) {
        const step = Math.min(SUB, left);
        left -= step;
        l.v += ((-s.stiffness * (l.p - 1) - s.damping * l.v) / s.mass) * step;
        l.p += l.v * step;
      }
      if (Math.abs(l.p - 1) < 0.01 && Math.abs(l.v) < 0.05) {
        b.lunge = null;
        const end = b.xs.length - 1;
        bakeSegment(b, b.baked, end);
        b.baked = end;
      }
    }
    cue.strength +=
      ((cue.on ? 1 : 0) - cue.strength) * (1 - Math.exp(-dt / 0.25));
  };

  const at = { x: 0, y: 0 };

  const sprite = (x: number, y: number, size: number, alpha: number) => {
    if (!ctx || alpha <= 0.01) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(glow, x - size / 2, y - size / 2, size, size);
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || w < 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(backdrop, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(tree, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The live ends, which may still retract or lunge.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stain;
    for (const b of branches) {
      const end = b.xs.length - 1;
      if (end <= b.baked && !b.lunge) continue;
      for (const [width, alpha] of [
        [b.width * 3.4, 0.07],
        [b.width, 0.86],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(b.xs[b.baked] ?? 0, b.ys[b.baked] ?? 0);
        for (let i = b.baked + 1; i <= end; i += 1) {
          if (i === end && b.lunge) {
            const l = b.lunge;
            ctx.lineTo(l.fx + (l.tx - l.fx) * l.p, l.fy + (l.ty - l.fy) * l.p);
          } else ctx.lineTo(b.xs[i] ?? 0, b.ys[i] ?? 0);
        }
        ctx.stroke();
      }
      // A growth cone: a small fan of filopodia feeling about.
      if (b.alive && b.retract <= 0 && c.motionSafe) {
        const x = b.xs[end] ?? 0;
        const y = b.ys[end] ?? 0;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let f = -1; f <= 1; f += 1) {
          const a =
            b.heading +
            f * 0.55 +
            Math.sin(clock * 3.1 + b.phase + f * 2) * 0.35;
          const len = 3.5 + Math.sin(clock * 2.3 + b.phase * 1.7 + f) * 1.5;
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        }
        ctx.stroke();
        sprite(x, y, 9, 0.45);
      }
    }
    // Junction boutons: bright knots where two cells touch.
    for (const j of junctions) {
      const r = Math.max(0, j.r);
      sprite(j.x, j.y, 14 + r * 4 + j.flash * 18, 0.55 + j.flash * 0.6);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(j.x, j.y, r * (0.55 + j.flash * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
    // Signals running out along the branches, and in to partners.
    if (c.motionSafe) {
      cells.forEach((cell, i) => {
        for (const t0 of cell.waves) {
          const d = (clock - t0) * PULSE_SPEED;
          for (let bi = 0; bi < branches.length; bi += 1) {
            const b = branches[bi];
            if (!b || b.cell !== i) continue;
            const local = d - b.s0;
            if (local < 0 || local > (b.ls[b.ls.length - 1] ?? 0)) continue;
            if (pointAt(bi, d, at)) {
              sprite(at.x, at.y, 9 + b.width * 3, 0.85);
            }
          }
        }
      });
      for (const p of inward) {
        if (clock < p.t0) continue;
        const d = p.from - (clock - p.t0) * PULSE_SPEED;
        if (pointAt(p.branch, d, at)) sprite(at.x, at.y, 13, 0.95);
      }
    }
    // Somata: a soft body, a darker nucleus, and the calcium flash.
    cells.forEach((cell, i) => {
      const lit = cell.flash + (stillLit.has(i) ? stillGlow : 0);
      sprite(cell.x, cell.y, cell.r * 6 + lit * 26, 0.7 + lit * 0.6);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = stain;
      ctx.beginPath();
      ctx.ellipse(
        cell.x,
        cell.y,
        cell.r * 1.08,
        cell.r * 0.9,
        i * 0.7,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = nucleus;
      ctx.beginPath();
      ctx.arc(
        cell.x + cell.r * 0.12,
        cell.y - cell.r * 0.08,
        cell.r * 0.46,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      if (lit > 0.02) {
        ctx.globalAlpha = Math.min(1, lit);
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, cell.r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Reduced motion: the stimulated network's boutons glow together.
    if (stillGlow > 0.01) {
      for (const j of junctions) {
        if (stillLit.has(j.a) || stillLit.has(j.b))
          sprite(j.x, j.y, 34, stillGlow);
      }
    }
    // The cue: a faint halo of growth factor.
    if (cue.strength > 0.02 && c.motionSafe) {
      sprite(
        cue.x,
        cue.y,
        Math.max(40, c.cueRadius) * 1.1,
        0.07 * cue.strength,
      );
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const busy = () => {
    if (growing) return true;
    if (inward.length > 0) return true;
    for (const cell of cells)
      if (cell.waves.length > 0 || cell.flash > 0.02) return true;
    for (const j of junctions)
      if (j.flash > 0.02 || Math.abs(j.r - 3.2) > 0.01 || Math.abs(j.v) > 0.05)
        return true;
    for (const b of branches) if (b.lunge) return true;
    if (Math.abs(cue.strength - (cue.on ? 1 : 0)) > 0.01) return true;
    return stillGlow > 0.005 || stillGlowTarget > 0;
  };

  const sleepUntilNextFire = () => {
    if (sleepTimer) window.clearTimeout(sleepTimer);
    sleepTimer = 0;
    const c = cfg;
    if (!c || !c.motionSafe || c.paused) return;
    let soonest = Number.POSITIVE_INFINITY;
    for (const cell of cells) soonest = Math.min(soonest, cell.nextFire);
    if (!Number.isFinite(soonest)) return;
    const wait = Math.max(16, (soonest - clock) * 1000);
    sleepTimer = window.setTimeout(() => {
      sleepTimer = 0;
      // Time has passed while asleep: the clock jumps to the firing.
      clock = Math.max(clock, soonest);
      kick();
    }, wait);
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
    if (!c.paused) {
      if (c.motionSafe) {
        clock += dt;
        if (growing) grow(dt, false);
        signal(dt);
      } else {
        // Reduced motion: only the stimulated glow crossfades.
        stillHold -= dt;
        if (stillHold <= 0) stillGlowTarget = 0;
        const rate = stillGlowTarget > stillGlow ? 0.12 : 0.6;
        stillGlow += (stillGlowTarget - stillGlow) * (1 - Math.exp(-dt / rate));
        if (stillGlowTarget === 0 && stillGlow < 0.005) stillGlow = 0;
      }
    }
    draw();
    if (!c.paused && busy()) {
      frame = window.requestAnimationFrame(tick);
    } else {
      last = 0;
      sleepUntilNextFire();
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || w < 1)
      return;
    if (sleepTimer) window.clearTimeout(sleepTimer);
    sleepTimer = 0;
    frame = window.requestAnimationFrame(tick);
  };

  const nearest = (x: number, y: number) => {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    cells.forEach((cell, i) => {
      const d = Math.hypot(cell.x - x, cell.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const stimulateCell = (i: number) => {
    const c = cfg;
    if (!c || i < 0) return;
    if (c.motionSafe) {
      const cell = cells[i];
      if (cell) cell.refractory = Math.min(cell.refractory, clock);
      fire(i, "stimulus");
    } else {
      // Everything this cell can reach through its junctions lights at once.
      const lit = new Set<number>([i]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const j of junctions) {
          if (lit.has(j.a) !== lit.has(j.b)) {
            lit.add(j.a);
            lit.add(j.b);
            grew = true;
          }
        }
      }
      stillLit = lit;
      stillGlowTarget = 1;
      stillHold = 0.42;
      events.current.fire(i, "stimulus");
    }
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
        stain = read(0, stain);
        core = read(1, core);
        field = read(2, field);
        nucleus = read(3, nucleus);
        layout();
        draw();
        kick();
        return;
      }
      if (
        was.seed !== next.seed ||
        was.dpr !== next.dpr ||
        was.cells !== next.cells ||
        was.reach !== next.reach ||
        // A new branching habit is a new culture: it regrows at once.
        was.branching !== next.branching ||
        was.motionSafe !== next.motionSafe
      ) {
        layout();
      } else if (was.colorKey !== next.colorKey) {
        readColours();
      }
      if (was.pulse !== next.pulse) {
        for (const cell of cells) cell.nextFire = nextGap(next);
      }
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
    },
    setCue(x, y) {
      cue.x = clamp(x, 0, w);
      cue.y = clamp(y, 0, h);
      cue.on = true;
      kick();
    },
    nudgeCue(dx, dy) {
      if (!cue.on) {
        cue.x = w / 2;
        cue.y = h / 2;
      }
      cue.x = clamp(cue.x + dx, 0, w);
      cue.y = clamp(cue.y + dy, 0, h);
      cue.on = true;
      kick();
    },
    clearCue() {
      const had = cue.on;
      cue.on = false;
      kick();
      return had;
    },
    stimulate() {
      stimulateCell(cue.on ? nearest(cue.x, cue.y) : 0);
    },
    stimulateAt(x, y) {
      stimulateCell(nearest(x, y));
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (sleepTimer) window.clearTimeout(sleepTimer);
      sleepTimer = 0;
    },
  };
}

/**
 * Fluorescent nerve cells under a microscope. Dendrites grow slowly out from
 * each soma by branching, their tips carrying growth cones that feel about;
 * when a tip meets another cell's dendrite it either pulls back along its own
 * path and turns away, or lunges the last pixels on springs.snap and forms a
 * junction, whose bouton blooms on springs.recoil.
 *
 * Cells fire on their own at `pulse` Hz: the soma flashes and a front of
 * light runs out along every branch; at a junction the bouton flashes and,
 * after a synaptic delay, a pulse runs in along the partner's dendrite to its
 * soma, which fires in turn — a signal passed across the dish. The pointer
 * offers a cue that nearby tips grow toward, and a click stimulates the
 * nearest cell. As a focusable group, the arrow keys move the cue, Enter and
 * Space stimulate, Escape clears the cue. Under reduced motion the culture is
 * a still micrograph, grown in one go; stimulating crossfades a glow over the
 * cell and everything connected to it.
 */
export function DendriteReach({
  branching = 0.5,
  pulse = 0.3,
  stain = "green",
  cells = 0,
  growth = 16,
  reach = 1,
  junctions = 0.6,
  cue = 0.6,
  cueRadius = 150,
  background = DEFAULT_BACKGROUND,
  interactive = true,
  paused = false,
  seed = 5,
  dpr = 2,
  onFire,
  onJunctionsChange,
  label = "Neuron culture",
  disabled = false,
  className,
}: DendriteReachProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [count, setCount] = React.useState(0);
  const [said, setSaid] = React.useState("");
  const stainColor = Object.prototype.hasOwnProperty.call(STAINS, stain)
    ? STAINS[stain as DendriteReachStain]
    : stain;
  const inks = [
    stainColor,
    `color-mix(in oklab, ${stainColor} 40%, white)`,
    background,
    `color-mix(in oklab, ${background} 70%, ${stainColor})`,
  ];
  const colorKey = inks.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callbacks = React.useRef({ onFire, onJunctionsChange });
  const lastSaid = React.useRef(0);
  const events = React.useRef<Events>({
    fire: (cell, cause) => {
      if (cause === "stimulus") setSaid(`Cell ${cell + 1} stimulated`);
      callbacks.current.onFire?.(cell, cause);
    },
    junction: (n, a, b, announce) => {
      setCount(n);
      callbacks.current.onJunctionsChange?.(n);
      // New junctions are spoken, but never more than one a second and a half.
      const now = performance.now();
      if (announce && a >= 0 && now - lastSaid.current > 1500) {
        lastSaid.current = now;
        setSaid(`Junction formed between cells ${a + 1} and ${b + 1}`);
      }
    },
  });

  const config: Config = {
    branching,
    pulse,
    cells,
    growth,
    reach,
    junctions,
    cue,
    cueRadius,
    paused,
    seed,
    dpr,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callbacks.current = { onFire, onJunctionsChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 4) return;
    const e = createEngine(root, canvas, carriers, visible, events);
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

  const inert = disabled || !interactive;

  const local = (event: { clientX: number; clientY: number }) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r
      ? { x: event.clientX - r.left, y: event.clientY - r.top }
      : { x: 0, y: 0 };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (inert) return;
    const e = engine.current;
    if (!e) return;
    const stride = event.shiftKey ? 72 : 24;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stride, 0],
      ArrowRight: [stride, 0],
      ArrowUp: [0, -stride],
      ArrowDown: [0, stride],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      e.nudgeCue(move[0], move[1]);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) e.stimulate();
      return;
    }
    if (event.key === "Escape" && e.clearCue()) event.preventDefault();
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      tabIndex={disabled ? -1 : 0}
      aria-roledescription="micrograph"
      aria-label={`${label}, ${count} ${count === 1 ? "junction" : "junctions"}`}
      aria-describedby={hintId}
      aria-disabled={inert || undefined}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (inert || event.pointerType === "touch") return;
        const p = local(event);
        engine.current?.setCue(p.x, p.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.clearCue();
      }}
      onPointerDown={(event) => {
        if (inert || event.pointerType !== "touch") return;
        const p = local(event);
        engine.current?.setCue(p.x, p.y);
      }}
      onClick={(event) => {
        if (inert || event.detail === 0) return;
        const p = local(event);
        engine.current?.stimulateAt(p.x, p.y);
      }}
      className={cn(
        "group/dendrite-reach relative isolate block h-56 w-full touch-pan-y overflow-clip rounded-3 [contain:paint] outline-none select-none",
        inert ? "cursor-default" : "cursor-crosshair",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ backgroundColor: background }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 block group-data-live/dendrite-reach:hidden"
        style={{
          backgroundImage: `radial-gradient(circle at 22% 46%, color-mix(in oklab, ${stainColor} 55%, transparent) 0 3px, color-mix(in oklab, ${stainColor} 12%, transparent) 14px, transparent 60px), radial-gradient(circle at 58% 38%, color-mix(in oklab, ${stainColor} 55%, transparent) 0 3px, color-mix(in oklab, ${stainColor} 12%, transparent) 14px, transparent 60px), radial-gradient(circle at 84% 60%, color-mix(in oklab, ${stainColor} 55%, transparent) 0 3px, color-mix(in oklab, ${stainColor} 12%, transparent) 14px, transparent 60px), radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4))`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 bottom-2.5 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.08em]"
        style={{ color: BAR_INK }}
      >
        <span className="h-px w-8 bg-current" />
        20 µm
      </span>
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
        Arrow keys move the cue that tips grow toward. Enter stimulates the
        nearest cell. Escape removes the cue.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
