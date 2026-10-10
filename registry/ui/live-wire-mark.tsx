"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LiveWireMarkProps = {
  /** The mark as SVG path data, in `viewBox` units. Any number of subpaths; corners and open ends are found for you. @default a hexagon with a G inside */
  path?: string;
  /** The viewBox `path` is drawn in. @default "0 0 100 100" */
  viewBox?: string;
  /** How hot the current runs, 0 to 1: the arcs' reach, speed and brightness. @default 0.5 */
  voltage?: number;
  /** How many arcs crawl the outline at rest; hover and focus add more. @default 3 */
  arcs?: number;
  /** The glow breathing under the outline, 0 to 1. @default 0.5 */
  glow?: number;
  /** The current's colour, any CSS colour; its hot core is mixed toward the foreground, so it is white-hot on dark and ink on light. @default "var(--accent-bright)" */
  color?: string;
  /** How much hover or keyboard focus raises the voltage, 0 to 1 of what is left to full. @default 0.5 */
  hoverBoost?: number;
  /** How fast the arcs crawl, as a multiple of the house pace (0.25 to 3). @default 1 */
  speed?: number;
  /** How often an arc throws a fork off its side, 0 to 1. @default 0.5 */
  forks?: number;
  /** Corners crackle with sparks once the voltage passes 0.6 (on hover, or set high). @default true */
  sparks?: boolean;
  /** Draw the outline itself as a faint wire. @default true */
  conductor?: boolean;
  /** The wire's stroke width, in CSS pixels. @default 1.5 */
  thickness?: number;
  /** The mark's accessible name. @default "Electric mark" */
  label?: string;
  /** A press discharges the mark; hover and focus charge it. Off, it is an image. @default true */
  interactive?: boolean;
  /** Hold the current still. @default false */
  paused?: boolean;
  /** Seed for where the arcs start and how they kink. @default 3 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Play a buzz when the visitor discharges the mark. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when the visitor discharges the mark. */
  onDischarge?: () => void;
  /** Classes for the box; size it here. @default "size-40" */
  className?: string;
};

/** A hexagonal nut with a G cut into it: corners for sparks, a curve for the arcs to run. */
const MARK =
  "M50 6 L88 28 L88 72 L50 94 L12 72 L12 28 Z M66 37 A19 19 0 1 0 69 57 L52 57";

const PAD = 0.14;
/** The inset and the drawn span as rounded percentages, for the markup. */
const PCT = Math.round(PAD * 1000) / 10;
const SPAN = Math.round((1 - 2 * PAD) * 1000) / 10;
const MAX_POINTS = 2400;
const MAX_RUNS = 32;
const MAX_ARCS = 16;
const MAX_FORKS = 32;
const MAX_SPARKS = 72;
const JITTER = 96;

/** Stroke passes for an arc: core or not, width, alpha. */
const PASSES: readonly [boolean, number, number][] = [
  [false, 5, 0.16],
  [false, 1.9, 0.55],
  [true, 0.9, 0.95],
];

type Rgb = [number, number, number];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const at = (a: Float32Array | Uint8Array | Int32Array, i: number) => a[i] ?? 0;

/**
 * The sampled outline in canvas pixels: points every `step` px along it,
 * split into runs (one per subpath). A closed run wraps on itself, so an arc
 * crawling round the hexagon never jumps across to the G.
 */
type Wire = {
  n: number;
  step: number;
  x: Float32Array;
  y: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  runs: number;
  runStart: Int32Array;
  runCount: Int32Array;
  runClosed: Uint8Array;
  /** Corners and open ends: where sparks fly, and which way. */
  hot: { x: number; y: number; ox: number; oy: number }[];
  outline: Path2D | null;
};

const emptyWire = (): Wire => ({
  n: 0,
  step: 1.5,
  x: new Float32Array(MAX_POINTS),
  y: new Float32Array(MAX_POINTS),
  nx: new Float32Array(MAX_POINTS),
  ny: new Float32Array(MAX_POINTS),
  runs: 0,
  runStart: new Int32Array(MAX_RUNS),
  runCount: new Int32Array(MAX_RUNS),
  runClosed: new Uint8Array(MAX_RUNS),
  hot: [],
  outline: null,
});

/** The point `d` samples from `i` along its own run: wrapping on a closed run, clamped on an open one (-1 past the end). */
function along(wire: Wire, run: number, local: number): number {
  const s = at(wire.runStart, run);
  const c = at(wire.runCount, run);
  if (c <= 0) return -1;
  const k = Math.round(local);
  if (wire.runClosed[run]) return s + (((k % c) + c) % c);
  if (k < 0 || k >= c) return -1;
  return s + k;
}

/** Samples a rendered path into the wire, mapped from its viewBox into the box. */
function sampleWire(
  wire: Wire,
  path: SVGPathElement,
  viewBox: [number, number, number, number],
  w: number,
  h: number,
): void {
  const [vx, vy, vw, vh] = viewBox;
  const iw = w * (1 - 2 * PAD);
  const ih = h * (1 - 2 * PAD);
  const scale = Math.min(iw / Math.max(vw, 1e-6), ih / Math.max(vh, 1e-6));
  const ox = w * PAD + (iw - vw * scale) / 2 - vx * scale;
  const oy = h * PAD + (ih - vh * scale) / 2 - vy * scale;
  let total = 0;
  try {
    total = path.getTotalLength();
  } catch {
    total = 0;
  }
  const n = Math.max(
    0,
    Math.min(MAX_POINTS, Math.floor((total * scale) / 1.5)),
  );
  wire.n = n;
  wire.step = n > 1 ? (total * scale) / n : 1.5;
  wire.runs = 0;
  wire.hot = [];
  wire.outline = null;
  if (n < 4) return;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const p = path.getPointAtLength((i / n) * total);
    wire.x[i] = ox + p.x * scale;
    wire.y[i] = oy + p.y * scale;
    cx += at(wire.x, i);
    cy += at(wire.y, i);
  }
  cx /= n;
  cy /= n;
  // Runs: a new one wherever the outline jumps (a new subpath).
  let start = 0;
  const close = (end: number) => {
    if (wire.runs >= MAX_RUNS) return;
    const count = end - start + 1;
    const r = wire.runs;
    wire.runStart[r] = start;
    wire.runCount[r] = count;
    const gapBack = Math.hypot(
      at(wire.x, end) - at(wire.x, start),
      at(wire.y, end) - at(wire.y, start),
    );
    wire.runClosed[r] = count > 8 && gapBack < wire.step * 3 ? 1 : 0;
    wire.runs += 1;
  };
  for (let i = 0; i < n - 1; i += 1) {
    const jump = Math.hypot(
      at(wire.x, i + 1) - at(wire.x, i),
      at(wire.y, i + 1) - at(wire.y, i),
    );
    if (jump > wire.step * 4) {
      close(i);
      start = i + 1;
    }
  }
  close(n - 1);
  const outline = new Path2D();
  for (let r = 0; r < wire.runs; r += 1) {
    const s = at(wire.runStart, r);
    const c = at(wire.runCount, r);
    for (let k = 0; k < c; k += 1) {
      const i = s + k;
      // Normals from the neighbours on the same run.
      const a = along(wire, r, k - 1);
      const b = along(wire, r, k + 1);
      const pa = a < 0 ? i : a;
      const pb = b < 0 ? i : b;
      let tx = at(wire.x, pb) - at(wire.x, pa);
      let ty = at(wire.y, pb) - at(wire.y, pa);
      const len = Math.hypot(tx, ty) || 1;
      tx /= len;
      ty /= len;
      wire.nx[i] = -ty;
      wire.ny[i] = tx;
      if (k === 0) outline.moveTo(at(wire.x, i), at(wire.y, i));
      else outline.lineTo(at(wire.x, i), at(wire.y, i));
    }
    if (wire.runClosed[r]) outline.closePath();
    // Corners: where the tangent turns sharply over a few pixels.
    let lastHot = -999;
    const span = 3;
    for (let k = 0; k < c; k += 1) {
      const i = s + k;
      const a = along(wire, r, k - span);
      const b = along(wire, r, k + span);
      if (a < 0 || b < 0) continue;
      let ax = at(wire.x, i) - at(wire.x, a);
      let ay = at(wire.y, i) - at(wire.y, a);
      let bx = at(wire.x, b) - at(wire.x, i);
      let by = at(wire.y, b) - at(wire.y, i);
      const la = Math.hypot(ax, ay) || 1;
      const lb = Math.hypot(bx, by) || 1;
      ax /= la;
      ay /= la;
      bx /= lb;
      by /= lb;
      const turn = Math.acos(clamp(ax * bx + ay * by, -1, 1));
      if (turn < (40 * Math.PI) / 180 || k - lastHot < 8) continue;
      lastHot = k;
      const ox2 = ax - bx;
      const oy2 = ay - by;
      const ol = Math.hypot(ox2, oy2) || 1;
      wire.hot.push({
        x: at(wire.x, i),
        y: at(wire.y, i),
        ox: ox2 / ol,
        oy: oy2 / ol,
      });
    }
    // Open ends throw sparks straight out from the mark.
    if (!wire.runClosed[r]) {
      for (const i of [s, s + c - 1]) {
        const ex = at(wire.x, i) - cx;
        const ey = at(wire.y, i) - cy;
        const el = Math.hypot(ex, ey) || 1;
        wire.hot.push({
          x: at(wire.x, i),
          y: at(wire.y, i),
          ox: ex / el,
          oy: ey / el,
        });
      }
    }
  }
  wire.outline = outline;
}

function parseViewBox(value: string): [number, number, number, number] {
  const v = value
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((x) => Number.isFinite(x));
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 100, v[3] ?? 100];
}

/**
 * An electric outline for any SVG mark. The mark is rendered for real as a
 * faint wire and sampled once per size into canvas points with normals,
 * corners and open ends; over it, arcs of current crawl the outline both ways
 * — jagged polylines whose kinks are re-rolled about thirty times a second
 * and taper at both ends, each drawn as a halo, a body and a hot core —
 * throwing short forks that flicker and die. A glow breathes under the wire.
 *
 * Hover or keyboard focus charges it on the drift spring: the arcs multiply,
 * reach further and run hotter, and past 0.6 the corners crackle with sparks
 * thrown out under gravity. A press discharges it: the whole outline flashes
 * on an exit tween, every arc dies, sparks burst from every corner, and the
 * charge climbs back on the drift spring with the new current setting out
 * from the point nearest the press. Under reduced motion it is a still frame
 * of a lit wire with frozen arcs that brightens on hover and goes dark for a
 * beat when pressed.
 */
export function LiveWireMark({
  path = MARK,
  viewBox = "0 0 100 100",
  voltage = 0.5,
  arcs = 3,
  glow = 0.5,
  color = "var(--accent-bright)",
  hoverBoost = 0.5,
  speed = 1,
  forks = 0.5,
  sparks = true,
  conductor = true,
  thickness = 1.5,
  label = "Electric mark",
  interactive = true,
  paused = false,
  seed = 3,
  dpr = 2,
  sound = false,
  onDischarge,
  className,
}: LiveWireMarkProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLElement | null>(null);
  const pathRef = React.useRef<SVGPathElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const press = React.useRef<{ x: number; y: number } | null>(null);
  const hold = React.useRef({ hover: false, focus: false });
  const beat = React.useRef(0);
  const setRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
  }, []);

  // Charge (hover, focus, discharge) and the flash ride motion values; the
  // loop reads them, so React never renders per frame.
  const boost = useMotionValue(0);
  const charge = useMotionValue(1);
  const flash = useMotionValue(0);

  const params = React.useRef({
    voltage,
    arcs,
    glow,
    hoverBoost,
    speed,
    forks,
    sparks,
    paused,
    seed,
    dpr,
    motionSafe,
    color,
    viewBox,
  });
  React.useEffect(() => {
    params.current = {
      voltage,
      arcs,
      glow,
      hoverBoost,
      speed,
      forks,
      sparks,
      paused,
      seed,
      dpr,
      motionSafe,
      color,
      viewBox,
    };
  });

  const api = React.useRef<{
    wake: () => void;
    resample: () => void;
    recolour: () => void;
    discharge: (x: number | null, y: number | null) => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const pathNode = pathRef.current;
    if (!root || !canvas || !pathNode) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const read = rgbReader();
    const wire = emptyWire();
    const jitter = new Float32Array(JITTER);
    // Arc, fork and spark pools: typed arrays, nothing allocated per frame.
    const arc = {
      alive: new Uint8Array(MAX_ARCS),
      run: new Int32Array(MAX_ARCS),
      pos: new Float32Array(MAX_ARCS),
      vel: new Float32Array(MAX_ARCS),
      len: new Float32Array(MAX_ARCS),
      age: new Float32Array(MAX_ARCS),
      life: new Float32Array(MAX_ARCS),
      kink: new Uint8Array(MAX_ARCS),
    };
    const fork = {
      alive: new Uint8Array(MAX_FORKS),
      x: new Float32Array(MAX_FORKS),
      y: new Float32Array(MAX_FORKS),
      dx: new Float32Array(MAX_FORKS),
      dy: new Float32Array(MAX_FORKS),
      len: new Float32Array(MAX_FORKS),
      age: new Float32Array(MAX_FORKS),
      life: new Float32Array(MAX_FORKS),
      kink: new Uint8Array(MAX_FORKS),
    };
    const spark = {
      alive: new Uint8Array(MAX_SPARKS),
      x: new Float32Array(MAX_SPARKS),
      y: new Float32Array(MAX_SPARKS),
      vx: new Float32Array(MAX_SPARKS),
      vy: new Float32Array(MAX_SPARKS),
      age: new Float32Array(MAX_SPARKS),
      life: new Float32Array(MAX_SPARKS),
    };
    let rnd = mulberry32(params.current.seed * 2654435761);
    let ink = "rgb(120, 140, 255)";
    let core = "rgb(240, 244, 255)";
    let additive = true;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let reroll = 0;
    let tick = 0;
    let inView = true;
    let originRun = -1;
    let originPos = 0;
    let originT = -9;

    const fillJitter = () => {
      for (let i = 0; i < JITTER; i += 1) jitter[i] = rnd() * 2 - 1;
    };
    fillJitter();

    const recolour = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const c = params.current.color;
      probe.style.color = c;
      const a = read(getComputedStyle(probe).color);
      probe.style.color = `color-mix(in oklab, ${c} 45%, var(--foreground))`;
      const b = read(getComputedStyle(probe).color);
      ink = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
      core = `rgb(${b[0]}, ${b[1]}, ${b[2]})`;
      // A light core is light on a dark page: add it. A dark core is ink on
      // a light page: lay it over.
      additive = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 255 > 0.55;
    };

    const resize = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 2 || h < 2) return false;
      const ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      sampleWire(wire, pathNode, parseViewBox(params.current.viewBox), w, h);
      arc.alive.fill(0);
      fork.alive.fill(0);
      spark.alive.fill(0);
      return true;
    };

    const pickRun = () => {
      let r = rnd() * wire.n;
      for (let i = 0; i < wire.runs; i += 1) {
        r -= at(wire.runCount, i);
        if (r <= 0) return i;
      }
      return Math.max(0, wire.runs - 1);
    };

    const energyNow = () => {
      const p = params.current;
      const base = clamp(p.voltage, 0, 1);
      const lifted =
        base + clamp(p.hoverBoost, 0, 1) * (1 - base) * boost.get();
      return lifted * clamp(charge.get(), 0, 1);
    };

    const spawnArc = (slot: number, energy: number, still: boolean) => {
      const p = params.current;
      const fresh = clock - originT < 0.7 && originRun >= 0;
      const run = fresh ? originRun : still ? slot % wire.runs : pickRun();
      const count = at(wire.runCount, run);
      arc.alive[slot] = 1;
      arc.run[slot] = run;
      arc.pos[slot] = fresh
        ? originPos
        : still
          ? ((slot + 0.5) / Math.max(1, p.arcs)) * count
          : rnd() * count;
      const dir = rnd() < 0.5 ? -1 : 1;
      // Speeds in samples per second (a sample is ~1.5px).
      arc.vel[slot] =
        (dir * (120 + rnd() * 140) * (0.5 + energy) * clamp(p.speed, 0.25, 3)) /
        wire.step;
      arc.len[slot] = clamp(count * (0.1 + rnd() * 0.12), 14, 110);
      arc.age[slot] = still ? 0.3 : 0;
      arc.life[slot] = still ? 99 : 0.6 + rnd();
      arc.kink[slot] = Math.floor(rnd() * JITTER);
    };

    const spawnFork = (i: number, energy: number) => {
      for (let f = 0; f < MAX_FORKS; f += 1) {
        if (fork.alive[f]) continue;
        const nx = at(wire.nx, i);
        const ny = at(wire.ny, i);
        const side = rnd() < 0.5 ? -1 : 1;
        const lean = (rnd() - 0.5) * 0.9;
        const dx = nx * side + ny * lean;
        const dy = ny * side - nx * lean;
        const l = Math.hypot(dx, dy) || 1;
        fork.alive[f] = 1;
        fork.x[f] = at(wire.x, i);
        fork.y[f] = at(wire.y, i);
        fork.dx[f] = dx / l;
        fork.dy[f] = dy / l;
        fork.len[f] = (8 + rnd() * 16) * (0.6 + energy);
        fork.age[f] = 0;
        fork.life[f] = 0.12 + rnd() * 0.1;
        fork.kink[f] = Math.floor(rnd() * JITTER);
        return;
      }
    };

    const spawnSpark = (x: number, y: number, ox: number, oy: number) => {
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (spark.alive[i]) continue;
        const a = Math.atan2(oy, ox) + (rnd() - 0.5) * 1.2;
        const v = 60 + rnd() * 110;
        spark.alive[i] = 1;
        spark.x[i] = x;
        spark.y[i] = y;
        spark.vx[i] = Math.cos(a) * v;
        spark.vy[i] = Math.sin(a) * v;
        spark.age[i] = 0;
        spark.life[i] = 0.25 + rnd() * 0.2;
        return;
      }
    };

    /** One jagged arc along its run, from `head` back `len` samples. */
    const traceArc = (slot: number, amp: number) => {
      const run = at(arc.run, slot);
      const head = at(arc.pos, slot);
      const len = at(arc.len, slot);
      const kink = at(arc.kink, slot);
      const segs = Math.max(3, Math.round((len * wire.step) / 5));
      const per = len / segs;
      let pen = false;
      for (let k = 0; k <= segs; k += 1) {
        const idx = along(wire, run, head - k * per);
        if (idx < 0) {
          pen = false;
          continue;
        }
        const t = k / segs;
        const taper = Math.pow(Math.sin(Math.PI * t), 0.7);
        const j = at(jitter, (kink + k * 7) % JITTER) * amp * taper;
        const x = at(wire.x, idx) + at(wire.nx, idx) * j;
        const y = at(wire.y, idx) + at(wire.ny, idx) * j;
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
    };

    const traceFork = (i: number, amp: number) => {
      const x0 = at(fork.x, i);
      const y0 = at(fork.y, i);
      const dx = at(fork.dx, i);
      const dy = at(fork.dy, i);
      const l = at(fork.len, i);
      ctx.moveTo(x0, y0);
      for (let k = 1; k <= 4; k += 1) {
        const t = k / 4;
        const j = at(jitter, (at(fork.kink, i) + k * 11) % JITTER) * amp * 0.6;
        ctx.lineTo(x0 + dx * l * t - dy * j, y0 + dy * l * t + dx * j);
      }
    };

    const draw = () => {
      const p = params.current;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      if (wire.n < 4) return;
      const e = energyNow();
      const f = clamp(flash.get(), 0, 1);
      const breathe = 0.5 + 0.5 * Math.sin((clock * Math.PI * 2) / 3.2);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
      // The glow under the wire, breathing.
      const g = clamp(p.glow, 0, 1);
      if (wire.outline && g > 0) {
        ctx.strokeStyle = ink;
        ctx.globalAlpha = g * (0.07 + 0.07 * breathe) * (0.4 + e);
        ctx.lineWidth = 10 + e * 8;
        ctx.stroke(wire.outline);
        ctx.globalAlpha = g * (0.12 + 0.1 * breathe) * (0.4 + e);
        ctx.lineWidth = 3.5 + e * 3;
        ctx.stroke(wire.outline);
      }
      const amp = 1.5 + e * 5.5;
      for (const [isCore, width, alpha] of PASSES) {
        ctx.strokeStyle = isCore ? core : ink;
        ctx.lineWidth = width * (0.8 + e * 0.5);
        for (let i = 0; i < MAX_ARCS; i += 1) {
          if (!arc.alive[i]) continue;
          const age = at(arc.age, i);
          const life = at(arc.life, i);
          const env = Math.min(1, age / 0.12, Math.max(0, (life - age) / 0.18));
          if (env <= 0) continue;
          ctx.globalAlpha = alpha * env * (0.45 + e * 0.6);
          ctx.beginPath();
          traceArc(i, amp);
          ctx.stroke();
        }
        for (let i = 0; i < MAX_FORKS; i += 1) {
          if (!fork.alive[i]) continue;
          // Forks flicker: they blink with the kink table.
          if (at(jitter, (at(fork.kink, i) + tick) % JITTER) < -0.45) continue;
          const env = 1 - at(fork.age, i) / Math.max(at(fork.life, i), 0.01);
          ctx.globalAlpha = alpha * env * 0.8;
          ctx.beginPath();
          traceFork(i, amp);
          ctx.stroke();
        }
      }
      // Sparks: short streaks along their flight.
      ctx.strokeStyle = core;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (!spark.alive[i]) continue;
        ctx.globalAlpha =
          1 - at(spark.age, i) / Math.max(at(spark.life, i), 0.01);
        const x = at(spark.x, i);
        const y = at(spark.y, i);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - at(spark.vx, i) * 0.025, y - at(spark.vy, i) * 0.025);
        ctx.stroke();
      }
      // The discharge: the whole wire at once.
      if (f > 0 && wire.outline) {
        ctx.strokeStyle = ink;
        ctx.globalAlpha = f * 0.5;
        ctx.lineWidth = 9 * f + 3;
        ctx.stroke(wire.outline);
        ctx.strokeStyle = core;
        ctx.globalAlpha = f;
        ctx.lineWidth = 1.5 + 2.5 * f;
        ctx.stroke(wire.outline);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    /** The reduced-motion frame: frozen arcs, seeded, as many as the energy asks. */
    const still = () => {
      rnd = mulberry32(params.current.seed * 2654435761);
      fillJitter();
      arc.alive.fill(0);
      fork.alive.fill(0);
      spark.alive.fill(0);
      const e = energyNow();
      const count =
        charge.get() < 0.15
          ? 0
          : clamp(Math.round(params.current.arcs * (0.6 + e)), 1, MAX_ARCS);
      if (wire.runs > 0)
        for (let i = 0; i < count; i += 1) spawnArc(i, e, true);
      draw();
    };

    const step = (dt: number) => {
      const p = params.current;
      const e = energyNow();
      clock += dt;
      reroll += dt;
      // The kinks re-roll near 30 Hz, a little faster when the current is hot.
      if (reroll > 1 / (24 + e * 18)) {
        reroll = 0;
        tick = (tick + 13) % JITTER;
        fillJitter();
      }
      const target =
        charge.get() < 0.15
          ? 0
          : clamp(Math.round(p.arcs * (0.6 + e * 1.1)), 1, MAX_ARCS);
      let alive = 0;
      for (let i = 0; i < MAX_ARCS; i += 1) {
        if (!arc.alive[i]) continue;
        arc.age[i] = at(arc.age, i) + dt;
        arc.pos[i] = at(arc.pos, i) + at(arc.vel, i) * dt;
        const run = at(arc.run, i);
        const count = at(wire.runCount, run);
        // On an open run an arc that runs off the end fades out there.
        if (
          !wire.runClosed[run] &&
          (at(arc.pos, i) < 0 || at(arc.pos, i) > count + at(arc.len, i))
        ) {
          arc.life[i] = Math.min(at(arc.life, i), at(arc.age, i) + 0.12);
        }
        if (at(arc.age, i) > at(arc.life, i)) {
          arc.alive[i] = 0;
          continue;
        }
        alive += 1;
        // More arcs than the charge allows: the extras fade rather than vanish.
        if (alive > target) {
          arc.life[i] = Math.min(at(arc.life, i), at(arc.age, i) + 0.18);
        }
        if (rnd() < clamp(p.forks, 0, 1) * (1 + 2 * e) * 2.5 * dt) {
          const idx = along(wire, run, at(arc.pos, i) - rnd() * at(arc.len, i));
          if (idx >= 0) spawnFork(idx, e);
        }
      }
      for (let i = 0; i < MAX_ARCS && alive < target; i += 1) {
        if (arc.alive[i]) continue;
        spawnArc(i, e, false);
        alive += 1;
      }
      for (let i = 0; i < MAX_FORKS; i += 1) {
        if (!fork.alive[i]) continue;
        fork.age[i] = at(fork.age, i) + dt;
        if (at(fork.age, i) > at(fork.life, i)) fork.alive[i] = 0;
      }
      if (p.sparks && e > 0.6) {
        const rate = (e - 0.6) * 14 * dt;
        for (const c of wire.hot) {
          if (rnd() < rate) spawnSpark(c.x, c.y, c.ox, c.oy);
        }
      }
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (!spark.alive[i]) continue;
        spark.age[i] = at(spark.age, i) + dt;
        if (at(spark.age, i) > at(spark.life, i)) {
          spark.alive[i] = 0;
          continue;
        }
        spark.vy[i] = at(spark.vy, i) + 320 * dt;
        spark.x[i] = at(spark.x, i) + at(spark.vx, i) * dt;
        spark.y[i] = at(spark.y, i) + at(spark.vy, i) * dt;
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || !p.motionSafe || p.paused) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (wire.runs > 0) step(dt);
      draw();
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe) {
        still();
        return;
      }
      if (p.paused) {
        draw();
        return;
      }
      if (raf || !inView || document.hidden) return;
      raf = requestAnimationFrame(frame);
    };

    const resample = () => {
      if (!resize()) return;
      if (!params.current.motionSafe) still();
      else draw();
      wake();
    };

    api.current = {
      wake,
      resample,
      recolour: () => {
        recolour();
        if (!params.current.motionSafe) still();
        else if (!raf) draw();
      },
      discharge: (px, py) => {
        const p = params.current;
        // Every arc dies; the new current sets out from the nearest point.
        arc.alive.fill(0);
        fork.alive.fill(0);
        if (wire.runs === 0) return;
        let best = -1;
        if (px !== null && py !== null) {
          let bestD = Infinity;
          for (let i = 0; i < wire.n; i += 2) {
            const d = Math.hypot(at(wire.x, i) - px, at(wire.y, i) - py);
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
        }
        if (best < 0) best = Math.floor(rnd() * wire.n);
        for (let r = 0; r < wire.runs; r += 1) {
          const s = at(wire.runStart, r);
          if (best >= s && best < s + at(wire.runCount, r)) {
            originRun = r;
            originPos = best - s;
          }
        }
        originT = clock;
        if (p.motionSafe && p.sparks) {
          for (const c of wire.hot) {
            for (let k = 0; k < 4; k += 1) spawnSpark(c.x, c.y, c.ox, c.oy);
          }
        }
      },
    };

    recolour();
    const sizer = new ResizeObserver(resample);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsubs = [boost, charge, flash].map((mv) =>
      mv.on("change", () => {
        if (!params.current.motionSafe) still();
        else if (!raf) draw();
      }),
    );

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      for (const off of unsubs) off();
      api.current = null;
    };
  }, [boost, charge, flash]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [color]);
  React.useEffect(() => {
    api.current?.resample();
  }, [path, viewBox, dpr]);
  React.useEffect(() => {
    api.current?.wake();
  }, [
    voltage,
    arcs,
    glow,
    hoverBoost,
    speed,
    forks,
    sparks,
    paused,
    seed,
    motionSafe,
  ]);
  React.useEffect(() => () => window.clearTimeout(beat.current), []);

  const raise = () => {
    const on = hold.current.hover || hold.current.focus;
    animate(boost, on ? 1 : 0, motionSafe ? springs.drift : { duration: 0 });
  };

  const discharge = () => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    const spot = press.current;
    press.current = null;
    onDischarge?.();
    api.current?.discharge(
      spot && rect ? spot.x - rect.left : null,
      spot && rect ? spot.y - rect.top : null,
    );
    audio.play("buzz", {
      pitch: 0.85 + clamp(voltage, 0, 1) * 0.35,
      gain: 0.5,
      pan: spot ? panFrom(spot.x, root) : 0,
    });
    window.clearTimeout(beat.current);
    if (!motionSafe) {
      // A beat with the wire dark, then lit again: no flicker, no travel.
      charge.jump(0.05);
      beat.current = window.setTimeout(() => charge.jump(1), 400);
      return;
    }
    flash.jump(1);
    animate(flash, 0, { duration: 0.32, ease: easings.exit });
    charge.jump(0);
    animate(charge, 1, { ...springs.drift, delay: 0.18 });
    api.current?.wake();
  };

  const vb = parseViewBox(viewBox);
  const art = (
    <>
      <svg
        aria-hidden
        viewBox={vb.join(" ")}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute overflow-visible"
        style={{
          left: `${PCT}%`,
          top: `${PCT}%`,
          width: `${SPAN}%`,
          height: `${SPAN}%`,
        }}
      >
        <path
          ref={pathRef}
          d={path}
          fill="none"
          stroke={
            conductor
              ? `color-mix(in oklab, ${color} 40%, var(--ink-3))`
              : "none"
          }
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.recolour()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </>
  );

  if (!interactive) {
    return (
      <span
        ref={setRoot}
        role="img"
        aria-label={label}
        className={cn("relative inline-block size-40 shrink-0", className)}
      >
        {art}
      </span>
    );
  }

  return (
    <motion.button
      ref={setRoot}
      type="button"
      aria-label={label}
      aria-describedby={hintId}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        hold.current.hover = true;
        raise();
      }}
      onPointerLeave={() => {
        hold.current.hover = false;
        raise();
      }}
      onPointerDown={(event) => {
        press.current = { x: event.clientX, y: event.clientY };
      }}
      onFocus={(event) => {
        hold.current.focus = event.currentTarget.matches(":focus-visible");
        raise();
      }}
      onBlur={() => {
        hold.current.focus = false;
        raise();
      }}
      onClick={discharge}
      whileTap={motionSafe ? { scale: 0.97 } : undefined}
      transition={springs.flick}
      className={cn(
        "relative inline-block size-40 shrink-0 cursor-pointer rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {art}
      <span id={hintId} className="sr-only">
        Press to discharge it.
      </span>
    </motion.button>
  );
}
