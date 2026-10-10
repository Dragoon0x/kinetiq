"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FiberMistProps = {
  /** The content on top of the haze: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many fibres drift through the haze, 40 to 800. @default 260 */
  count?: number;
  /** How far each fibre's light spreads into the haze, 0 (bare threads) to 1. @default 0.5 */
  glow?: number;
  /** How fast the flow carries the fibres, 0 (still) to 3. @default 1 */
  drift?: number;
  /** Fibre colours, as CSS colours (up to four); each fibre takes one. @default ["var(--accent-bright)", "var(--signal)", "color-mix(in oklab, var(--foreground) 70%, var(--accent-bright))"] */
  colors?: readonly string[];
  /** The haze behind them, any CSS colour: dark haze makes the fibres glow, pale haze makes them ink. @default "var(--background)" */
  haze?: string;
  /** A fibre's length, in px. @default 200 */
  length?: number;
  /** How tightly the flow curls, 0 (long lazy sweeps) to 1 (tight eddies). @default 0.35 */
  curl?: number;
  /** A fibre's core width, in px. @default 0.9 */
  width?: number;
  /** The pointer combs the fibres, and keyboard focus draws them into a stream. @default true */
  interactive?: boolean;
  /** How firmly the pointer combs, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** A press on the haze (not on a control) puffs the fibres outward from it. @default true */
  pulse?: boolean;
  /** The fibres draw themselves out of the haze the first time it comes into view. @default true */
  intro?: boolean;
  /** Hold the flow still; the pointer can still comb it. @default false */
  paused?: boolean;
  /** Seeds where every fibre starts, its colour and the flow. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) combing. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const COLORS = [
  "var(--accent-bright)",
  "var(--signal)",
  "color-mix(in oklab, var(--foreground) 70%, var(--accent-bright))",
] as const;

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** Points along each fibre, half each way from its anchor. */
const POINTS = 24;
/** Fibres are stroked in this many interleaved batches per colour, so crossings between batches still add up. */
const BATCHES = 8;
/** The flow is evaluated on a grid this many px apart. */
const CELL = 22;
/** A combed region relaxes back into the flow with this time constant, s: gone in about a second and a half. */
const RELAX = 0.55;
/** At drift 1, an anchor travels this fast, px/s. */
const CARRY = 14;
const MAX_COLORS = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator: the same mist for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A lattice hash in [0, 1). Unsigned shifts throughout. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 1274126177) ^
    seed;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise over x, y and time. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, yi, zi, seed);
  const b = hash3(xi + 1, yi, zi, seed);
  const c = hash3(xi, yi + 1, zi, seed);
  const d = hash3(xi + 1, yi + 1, zi, seed);
  const e = hash3(xi, yi, zi + 1, seed);
  const f = hash3(xi + 1, yi, zi + 1, seed);
  const g = hash3(xi, yi + 1, zi + 1, seed);
  const h = hash3(xi + 1, yi + 1, zi + 1, seed);
  const lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  const hi = e + (f - e) * u + (g - e) * v + (e - f - g + h) * u * v;
  return lo + (hi - lo) * w;
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Field = {
  w: number;
  h: number;
  dpr: number;
  /** Grid nodes across and down, starting one cell outside the box. */
  gx: number;
  gy: number;
  psi: Float32Array;
  /** The curl flow and the comb, per node. */
  fx: Float32Array;
  fy: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
};

type Fibres = {
  n: number;
  /** Anchors as fractions of the box until the first size, then in px. */
  ax: Float32Array;
  ay: Float32Array;
  tone: Uint8Array;
  reach: Float32Array;
  px: Float32Array;
  py: Float32Array;
  sized: boolean;
};

function fibresOf(n: number, seed: number, tones: number): Fibres {
  const rand = lcg(seed * 13 + 5);
  const f: Fibres = {
    n,
    ax: new Float32Array(n),
    ay: new Float32Array(n),
    tone: new Uint8Array(n),
    reach: new Float32Array(n),
    px: new Float32Array(n * POINTS),
    py: new Float32Array(n * POINTS),
    sized: false,
  };
  for (let i = 0; i < n; i += 1) {
    f.ax[i] = rand();
    f.ay[i] = rand();
    f.tone[i] = Math.floor(rand() * tones);
    f.reach[i] = 0.55 + rand() * 0.6;
  }
  return f;
}

type Sim = {
  t: number;
  last: number;
  carry: number;
  /** The intro: how much of each fibre has drawn itself. */
  rise: number;
  riseV: number;
  riseTo: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  on: boolean;
  level: number;
  levelV: number;
  source: "pointer" | "focus" | null;
  focus: { x: number; y: number; w: number } | null;
  /** The furthest the comb pulls anywhere, to know when it has relaxed. */
  combed: number;
};

type Paint = {
  haze: string;
  glow: string;
  dark: boolean;
  tones: string[];
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readPalette: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/**
 * Fine fibres of light drifting in haze, as a background, with the content
 * on top in its own layer. Every fibre is a streamline of a slowly turning
 * curl-noise flow, traced through it from an anchor the flow itself
 * carries, so the fibres curve together and never knot. Each is drawn as a
 * fine core inside a faint halo: in a dark haze they add light and glow
 * brighter where they cross; in a pale haze they multiply and deepen there,
 * like ink silk.
 *
 * The pointer combs: where it moves, the fibres align to its path and then
 * relax back into the flow (its position on springs.glide, its presence on
 * springs.drift), and a press puffs them outward from that point. It is
 * decoration: `aria-hidden`, never a focus stop, never in the way of a
 * click; keyboard focus on a control inside draws the fibres into a level
 * stream through it. Canvas 2D in a few dozen batched strokes, drawn only
 * while on screen, in a visible page and while something moves. Under
 * reduced motion the mist stands still and the pointer combs it directly.
 */
export function FiberMist({
  children,
  count = 260,
  glow = 0.5,
  drift = 1,
  colors = COLORS,
  haze = "var(--background)",
  length = 200,
  curl = 0.35,
  width = 0.9,
  interactive = true,
  pointerStrength = 0.7,
  pulse = true,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: FiberMistProps) {
  const motionSafe = useMotionSafe();
  const tones = (colors.length ? colors : COLORS).slice(0, MAX_COLORS);
  const paints = [
    haze,
    `color-mix(in oklab, ${tones[0] ?? COLORS[0]} 24%, ${haze})`,
    ...tones,
  ];
  const paintKey = paints.join("|");
  const n = clamp(Math.round(count), 40, 800);
  const toneCount = tones.length;

  const k = {
    glow: clamp01(glow),
    drift: clamp(drift, 0, 3),
    length: clamp(length, 40, 600),
    curl: clamp01(curl),
    width: clamp(width, 0.4, 3),
    strength: clamp01(pointerStrength),
    pulse,
    intro,
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const field = React.useRef<Field | null>(null);
  const fibres = React.useRef<Fibres | null>(null);
  const paint = React.useRef<Paint | null>(null);
  const swell = React.useRef<CanvasGradient | null>(null);
  const shade = React.useRef<CanvasGradient | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const arrived = React.useRef(false);
  const active = React.useRef(false);
  /** The canvas has painted, and the stand-in has been told to go. */
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    t: 0,
    last: 0,
    carry: 0,
    rise: 1,
    riseV: 0,
    riseTo: 1,
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    on: false,
    level: 0,
    levelV: 0,
    source: null,
    focus: null,
    combed: 0,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onActiveChange);
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Every carrier's colour as a canvas colour string, and whether the haze is dark. */
  const readPalette = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const read = (el: Element | undefined) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      if (el) ctx.fillStyle = getComputedStyle(el).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as const;
    };
    const spans = carriers.children;
    const hz = read(spans[0]);
    const gl = read(spans[1]);
    const list: string[] = [];
    for (let i = 2; i < spans.length; i += 1) {
      const c = read(spans[i]);
      list.push(`rgb(${c[0]}, ${c[1]}, ${c[2]})`);
    }
    const luma = (0.2126 * hz[0] + 0.7152 * hz[1] + 0.0722 * hz[2]) / 255;
    paint.current = {
      haze: `rgb(${hz[0]}, ${hz[1]}, ${hz[2]})`,
      glow: `rgb(${gl[0]}, ${gl[1]}, ${gl[2]})`,
      dark: luma < 0.5,
      tones: list,
    };
    shapeHaze();
  };

  /** The haze's swell and vignette, built once per size and palette and moved by transform. */
  const shapeHaze = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const f = field.current;
    const p = paint.current;
    if (!ctx || !f || !p) return;
    const r = Math.max(f.w, f.h) * 0.62;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, p.glow);
    g.addColorStop(1, p.haze);
    swell.current = g;
    const v = ctx.createRadialGradient(
      f.w / 2,
      f.h / 2,
      Math.min(f.w, f.h) * 0.35,
      f.w / 2,
      f.h / 2,
      Math.hypot(f.w, f.h) * 0.62,
    );
    v.addColorStop(0, "rgba(0, 0, 0, 0)");
    v.addColorStop(1, p.dark ? "rgba(0, 0, 0, 0.32)" : "rgba(0, 0, 0, 0.05)");
    shade.current = v;
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = Math.min(k.dpr, window.devicePixelRatio || 1);
    const was = field.current;
    if (was && was.w === w && was.h === h && was.dpr === ratio) return;
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    const gx = Math.ceil(w / CELL) + 3;
    const gy = Math.ceil(h / CELL) + 3;
    const nodes = gx * gy;
    field.current = {
      w,
      h,
      dpr: ratio,
      gx,
      gy,
      psi: new Float32Array(nodes),
      fx: new Float32Array(nodes),
      fy: new Float32Array(nodes),
      cx: new Float32Array(nodes),
      cy: new Float32Array(nodes),
    };
    // Anchors keep their place in the box as it changes size.
    const fb = fibres.current;
    if (fb) {
      for (let i = 0; i < fb.n; i += 1) {
        fb.ax[i] = fb.sized
          ? ((fb.ax[i] ?? 0) / (was?.w ?? w)) * w
          : (fb.ax[i] ?? 0) * w;
        fb.ay[i] = fb.sized
          ? ((fb.ay[i] ?? 0) / (was?.h ?? h)) * h
          : (fb.ay[i] ?? 0) * h;
      }
      fb.sized = true;
    }
    // A fresh grid has no flow yet; a held or reduced-motion mist would
    // otherwise draw from zeros until something moved.
    flow();
    shapeHaze();
  };

  /** The curl of the noise on the grid: one noise sample per node, differences for the curl. */
  const flow = () => {
    const f = field.current;
    if (!f) return;
    const { gx, gy, psi, fx, fy } = f;
    const s = sim.current;
    const scale = 1 / (420 - 300 * k.curl);
    const time = s.t * 0.07;
    const seedBits = Math.round(k.seed * 7919) | 0;
    // A lazier flow leans harder on its drift across, so it meanders rather
    // than curling into eddies.
    const bias = 0.95 - 0.7 * k.curl;
    for (let j = 0; j < gy; j += 1) {
      const y = (j - 1) * CELL * scale;
      for (let i = 0; i < gx; i += 1) {
        const x = (i - 1) * CELL * scale;
        psi[j * gx + i] =
          noise3(x, y, time, seedBits) +
          0.45 * noise3(x * 2.1 + 5.3, y * 2.1 + 1.7, time * 1.6, seedBits);
      }
    }
    for (let j = 0; j < gy; j += 1) {
      for (let i = 0; i < gx; i += 1) {
        const at = j * gx + i;
        const up = psi[(j > 0 ? j - 1 : j) * gx + i] ?? 0;
        const down = psi[(j < gy - 1 ? j + 1 : j) * gx + i] ?? 0;
        const left = psi[j * gx + (i > 0 ? i - 1 : i)] ?? 0;
        const right = psi[j * gx + (i < gx - 1 ? i + 1 : i)] ?? 0;
        // The curl: perpendicular to the potential's slope, so the flow
        // has no sources or sinks. A gentle bias keeps it moving across.
        let vx = (down - up) * 4.5 + bias;
        let vy = -(right - left) * 4.5 + bias * 0.12;
        const m = Math.hypot(vx, vy) || 1;
        vx /= m;
        vy /= m;
        fx[at] = vx;
        fy[at] = vy;
      }
    }
  };

  /** The flow plus the comb at (x, y), bilinear, as a unit vector into out. */
  const along = (x: number, y: number, out: { x: number; y: number }) => {
    const f = field.current;
    if (!f) return;
    const gxf = clamp(x / CELL + 1, 0, f.gx - 1.001);
    const gyf = clamp(y / CELL + 1, 0, f.gy - 1.001);
    const i = Math.floor(gxf);
    const j = Math.floor(gyf);
    const u = gxf - i;
    const v = gyf - j;
    const a = j * f.gx + i;
    const b = a + 1;
    const c = a + f.gx;
    const d = c + 1;
    const wa = (1 - u) * (1 - v);
    const wb = u * (1 - v);
    const wc = (1 - u) * v;
    const wd = u * v;
    // The comb outweighs the flow where it is strong: combed fibres lie
    // along the hand's path.
    const vx =
      (f.fx[a] ?? 0) * wa +
      (f.fx[b] ?? 0) * wb +
      (f.fx[c] ?? 0) * wc +
      (f.fx[d] ?? 0) * wd +
      ((f.cx[a] ?? 0) * wa +
        (f.cx[b] ?? 0) * wb +
        (f.cx[c] ?? 0) * wc +
        (f.cx[d] ?? 0) * wd) *
        3.2;
    const vy =
      (f.fy[a] ?? 0) * wa +
      (f.fy[b] ?? 0) * wb +
      (f.fy[c] ?? 0) * wc +
      (f.fy[d] ?? 0) * wd +
      ((f.cy[a] ?? 0) * wa +
        (f.cy[b] ?? 0) * wb +
        (f.cy[c] ?? 0) * wc +
        (f.cy[d] ?? 0) * wd) *
        3.2;
    const m = Math.hypot(vx, vy) || 1;
    out.x = vx / m;
    out.y = vy / m;
  };

  const dir = { x: 0, y: 0 };

  /** Every fibre traced from its anchor, both ways, into the point arrays. */
  const trace = () => {
    const fb = fibres.current;
    const f = field.current;
    if (!fb || !f || !fb.sized) return;
    const half = POINTS / 2;
    for (let i = 0; i < fb.n; i += 1) {
      const stepLen = (k.length * (fb.reach[i] ?? 1)) / POINTS;
      const base = i * POINTS;
      const ax = fb.ax[i] ?? 0;
      const ay = fb.ay[i] ?? 0;
      fb.px[base + half] = ax;
      fb.py[base + half] = ay;
      // Forward from the anchor, then back: a streamline either side.
      let x = ax;
      let y = ay;
      for (let q = 1; q < half; q += 1) {
        along(x, y, dir);
        x += dir.x * stepLen;
        y += dir.y * stepLen;
        fb.px[base + half + q] = x;
        fb.py[base + half + q] = y;
      }
      x = ax;
      y = ay;
      for (let q = 1; q <= half; q += 1) {
        along(x, y, dir);
        x -= dir.x * stepLen;
        y -= dir.y * stepLen;
        fb.px[base + half - q] = x;
        fb.py[base + half - q] = y;
      }
    }
  };

  /** One frame of haze and fibres. */
  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const f = field.current;
    const fb = fibres.current;
    const p = paint.current;
    if (!ctx || !f || !fb || !p || !fb.sized || !visible.current) return;
    const s = sim.current;
    trace();
    ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.haze;
    ctx.fillRect(0, 0, f.w, f.h);
    // A slow luminous swell in the haze.
    if (swell.current) {
      const sx = f.w * (0.5 + 0.22 * Math.sin(s.t * 0.05 + k.seed));
      const sy = f.h * (0.45 + 0.12 * Math.cos(s.t * 0.04 + k.seed * 0.7));
      ctx.globalAlpha = p.dark ? 0.85 : 0.6;
      ctx.translate(sx, sy);
      ctx.fillStyle = swell.current;
      ctx.fillRect(-sx, -sy, f.w, f.h);
      ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
      ctx.globalAlpha = 1;
    }
    // Fibres: halo then core, in interleaved batches, so where fibres from
    // different batches cross, their light adds (or their ink deepens).
    ctx.globalCompositeOperation = p.dark ? "lighter" : "multiply";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const half = POINTS / 2;
    const drawn = Math.max(1, Math.round(half * s.rise));
    const haloAlpha = p.dark ? 0.03 + k.glow * 0.08 : 0.025 + k.glow * 0.05;
    const coreAlpha = p.dark ? 0.36 : 0.24;
    // The halo falls off in two steps, a near glow and a wider, fainter one,
    // so it reads as light in haze rather than a flat ribbon.
    const haloWidth = k.width + 1.5 + k.glow * 4.5;
    const hazeWidth = k.width + 3 + k.glow * 12;
    for (let tone = 0; tone < p.tones.length; tone += 1) {
      ctx.strokeStyle = p.tones[tone] ?? p.glow;
      for (let batch = 0; batch < BATCHES; batch += 1) {
        ctx.beginPath();
        let any = false;
        for (let i = batch; i < fb.n; i += BATCHES) {
          if ((fb.tone[i] ?? 0) !== tone) continue;
          const base = i * POINTS + half;
          ctx.moveTo(fb.px[base - drawn] ?? 0, fb.py[base - drawn] ?? 0);
          for (let q = -drawn + 1; q < drawn; q += 1) {
            ctx.lineTo(fb.px[base + q] ?? 0, fb.py[base + q] ?? 0);
          }
          any = true;
        }
        if (!any) continue;
        if (k.glow > 0) {
          ctx.globalAlpha = haloAlpha * 0.5;
          ctx.lineWidth = hazeWidth;
          ctx.stroke();
          ctx.globalAlpha = haloAlpha;
          ctx.lineWidth = haloWidth;
          ctx.stroke();
        }
        ctx.globalAlpha = coreAlpha;
        ctx.lineWidth = k.width;
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (shade.current) {
      ctx.fillStyle = shade.current;
      ctx.fillRect(0, 0, f.w, f.h);
    }
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /**
   * The hand's comb: its direction of travel laid into the grid around it,
   * a level stream through a focused control, and everywhere the comb
   * relaxing toward nothing.
   */
  const comb = (dt: number, instant: boolean) => {
    const f = field.current;
    if (!f) return;
    const s = sim.current;
    const reach = clamp(Math.min(f.w, f.h) * 0.36, 50, 150);
    const fade = instant ? 0 : Math.exp(-dt / RELAX);
    const speed = Math.hypot(s.vx, s.vy);
    const pull = instant ? 1 : 1 - Math.exp(-dt * 10);
    const focus = s.source === "focus" && s.focus;
    // A hand at rest combs nothing; a moving one lays its heading down.
    const moving = s.level > 0.01 && (speed > 8 || focus);
    let hx = 0;
    let hy = 0;
    if (moving && !focus) {
      hx = s.vx / speed;
      hy = s.vy / speed;
    }
    let most = 0;
    for (let j = 0; j < f.gy; j += 1) {
      const y = (j - 1) * CELL;
      for (let i = 0; i < f.gx; i += 1) {
        const at = j * f.gx + i;
        let cx = (f.cx[at] ?? 0) * fade;
        let cy = (f.cy[at] ?? 0) * fade;
        if (moving) {
          const x = (i - 1) * CELL;
          const dx = x - s.x;
          const dy = y - s.y;
          // A focused control's stream is long and level; the pointer's
          // comb is round.
          const rx = focus
            ? Math.max(reach * 1.8, (s.focus?.w ?? 0) * 0.8)
            : reach;
          const ry = focus ? reach * 0.7 : reach;
          const wgt =
            Math.exp(-(dx * dx) / (rx * rx) - (dy * dy) / (ry * ry)) *
            k.strength *
            s.level *
            pull;
          const tx = focus ? 1 : hx;
          const ty = focus ? 0 : hy;
          cx += (tx - cx) * wgt;
          cy += (ty - cy) * wgt;
        }
        f.cx[at] = cx;
        f.cy[at] = cy;
        const m = Math.abs(cx) + Math.abs(cy);
        if (m > most) most = m;
      }
    }
    if (most < 0.004) {
      f.cx.fill(0);
      f.cy.fill(0);
      most = 0;
    }
    s.combed = most;
  };

  /**
   * A puff from (x, y): the comb laid in a spiral round the press, strongest
   * a little way out and nothing at the centre, so the fibres swirl aside
   * like stirred mist and then relax, with no knot where the press was.
   */
  const puff = (x: number, y: number, strength: number) => {
    if (!k.pulse || !k.motionSafe) return;
    const f = field.current;
    if (!f) return;
    const reach = clamp(Math.min(f.w, f.h) * 0.45, 60, 180);
    for (let j = 0; j < f.gy; j += 1) {
      for (let i = 0; i < f.gx; i += 1) {
        const at = j * f.gx + i;
        const dx = (i - 1) * CELL - x;
        const dy = (j - 1) * CELL - y;
        const d = Math.hypot(dx, dy) || 1;
        const q = d / reach;
        // Peaks at q = 0.7, about 1 there.
        const wgt = 2.3 * q * Math.exp(-q * q) * strength;
        const ox = dx / d;
        const oy = dy / d;
        f.cx[at] = (f.cx[at] ?? 0) + (ox * 0.45 - oy) * wgt;
        f.cy[at] = (f.cy[at] ?? 0) + (oy * 0.45 + ox) * wgt;
      }
    }
    sim.current.combed = Math.max(sim.current.combed, strength);
    kick();
  };

  /** Advances the flow, the anchors, the comb and the springs; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const f = field.current;
    const fb = fibres.current;
    if (!f || !fb) return false;
    const target = s.on ? 1 : 0;
    if (!k.motionSafe) {
      s.x = s.tx;
      s.y = s.ty;
      s.level = target;
      s.levelV = 0;
      s.rise = 1;
      s.riseV = 0;
      flow();
      if (!s.on) {
        f.cx.fill(0);
        f.cy.fill(0);
        s.combed = 0;
      }
      return false;
    }
    const drifting = !k.paused && k.drift > 0;
    if (drifting) s.t += dt * k.drift;
    const G = springs.glide;
    const D = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      const ax = (-G.stiffness * (s.x - s.tx) - G.damping * s.vx) / G.mass;
      const ay = (-G.stiffness * (s.y - s.ty) - G.damping * s.vy) / G.mass;
      s.vx += ax * STEP;
      s.vy += ay * STEP;
      s.x += s.vx * STEP;
      s.y += s.vy * STEP;
      const al =
        (-D.stiffness * (s.level - target) - D.damping * s.levelV) / D.mass;
      s.levelV += al * STEP;
      s.level += s.levelV * STEP;
      const ar =
        (-D.stiffness * (s.rise - s.riseTo) - D.damping * s.riseV) / D.mass;
      s.riseV += ar * STEP;
      s.rise += s.riseV * STEP;
    }
    if (steps === 8) s.carry = 0;
    flow();
    comb(dt, false);
    // Anchors ride the flow, and wrap round well outside the box so no
    // fibre ever pops in or out of view. Held still, they stay put, so a
    // combed mist relaxes back to exactly the fibres it had.
    if (drifting) {
      const margin = k.length * 0.62;
      const ride = CARRY * k.drift * dt;
      for (let i = 0; i < fb.n; i += 1) {
        along(fb.ax[i] ?? 0, fb.ay[i] ?? 0, dir);
        let x = (fb.ax[i] ?? 0) + dir.x * ride;
        let y = (fb.ay[i] ?? 0) + dir.y * ride;
        if (x > f.w + margin) x -= f.w + margin * 2;
        else if (x < -margin) x += f.w + margin * 2;
        if (y > f.h + margin) y -= f.h + margin * 2;
        else if (y < -margin) y += f.h + margin * 2;
        fb.ax[i] = x;
        fb.ay[i] = y;
      }
    }
    const handMoving =
      Math.abs(s.x - s.tx) + Math.abs(s.y - s.ty) > 0.05 ||
      Math.abs(s.vx) + Math.abs(s.vy) > 0.5;
    if (!handMoving) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
    }
    const levelMoving =
      Math.abs(s.level - target) > 0.002 || Math.abs(s.levelV) > 0.01;
    if (!levelMoving) {
      s.level = target;
      s.levelV = 0;
    }
    const rising =
      Math.abs(s.rise - s.riseTo) > 0.001 || Math.abs(s.riseV) > 0.005;
    if (!rising) {
      s.rise = s.riseTo;
      s.riseV = 0;
    }
    return (
      drifting ||
      s.combed > 0 ||
      (handMoving && s.level > 0.001) ||
      levelMoving ||
      rising ||
      (s.source === "focus" && s.level > 0)
    );
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** The first sighting: the fibres draw themselves out of the haze. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe) {
      s.rise = 0;
      s.riseV = 0;
    }
    s.riseTo = 1;
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readPalette, tick, arrive };
    report.current = onActiveChange;
  });

  // New fibres for a new count, seed or colour count; the flow carries on.
  React.useEffect(() => {
    const fb = fibresOf(n, seed, toneCount);
    fibres.current = fb;
    const f = field.current;
    if (f) {
      for (let i = 0; i < fb.n; i += 1) {
        fb.ax[i] = (fb.ax[i] ?? 0) * f.w;
        fb.ay[i] = (fb.ay[i] ?? 0) * f.h;
      }
      fb.sized = true;
    }
    api.current?.draw();
    api.current?.kick();
  }, [n, seed, toneCount]);

  React.useEffect(() => {
    api.current?.readPalette();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  // Anything that changes the picture: draw it, and run if it now moves.
  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.glow,
    k.drift,
    k.length,
    k.curl,
    k.width,
    k.strength,
    paused,
    motionSafe,
  ]);

  // Switching the hand off lets the fibres relax, and says so.
  React.useEffect(() => {
    if (interactive) return;
    const s = sim.current;
    s.on = false;
    s.source = null;
    s.focus = null;
    api.current?.kick();
    if (active.current) {
      active.current = false;
      report.current?.(false);
    }
  }, [interactive]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.readPalette();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.arrive();
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const setActive = (next: boolean) => {
    if (active.current === next) return;
    active.current = next;
    report.current?.(next);
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** Under reduced motion the comb lies down at once along the pointer's last step. */
  const combNow = (dx: number, dy: number) => {
    const s = sim.current;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    s.vx = (dx / d) * 60;
    s.vy = (dy / d) * 60;
    comb(0, true);
    api.current?.draw();
  };

  /** The hand goes to (x, y); arriving from nowhere, it starts there. */
  const handTo = (x: number, y: number, source: "pointer" | "focus") => {
    const s = sim.current;
    const dx = x - s.tx;
    const dy = y - s.ty;
    const fresh = s.level < 0.01 || !s.on;
    if (fresh) {
      s.x = x;
      s.y = y;
      s.vx = 0;
      s.vy = 0;
    }
    s.tx = x;
    s.ty = y;
    s.on = true;
    s.source = source;
    setActive(true);
    if (!k.motionSafe) {
      s.x = x;
      s.y = y;
      s.level = 1;
      if (source === "focus") {
        comb(0, true);
        api.current?.draw();
      } else if (!fresh) combNow(dx, dy);
      return;
    }
    kick();
  };

  /** The pointer leaves: the comb goes back to a focused control, or relaxes. */
  const handAway = () => {
    const s = sim.current;
    if (s.focus) {
      handTo(s.focus.x, s.focus.y, "focus");
      return;
    }
    s.on = false;
    s.source = null;
    setActive(false);
    if (!k.motionSafe) {
      const f = field.current;
      f?.cx.fill(0);
      f?.cy.fill(0);
      s.combed = 0;
      s.level = 0;
      api.current?.draw();
      return;
    }
    kick();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) puff(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") handAway();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && sim.current.source === "pointer")
      handAway();
  };

  // Keyboard focus on a control inside draws the fibres into a stream through it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    const root = rootRef.current;
    if (!root || !(el instanceof Element) || !el.matches(":focus-visible"))
      return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    sim.current.focus = { ...at, w: r.width };
    handTo(at.x, at.y, "focus");
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    const s = sim.current;
    s.focus = null;
    if (s.source === "focus") handAway();
  };

  const onColour = () => {
    api.current?.readPalette();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/fiber-mist relative isolate h-full w-full touch-manipulation overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/fiber-mist:invisible group-data-live/fiber-mist:opacity-0"
        style={standIn(paints)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColour}
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
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * haze with its swell, and a few long faint streaks where the fibres will be.
 */
function standIn(paints: readonly string[]): React.CSSProperties {
  const [haze, glow, a = haze, b = a] = paints;
  return {
    backgroundColor: haze,
    backgroundImage: [
      `repeating-linear-gradient(172deg, transparent 0 11px, color-mix(in oklab, ${a} 16%, transparent) 11px 12px, transparent 12px 23px, color-mix(in oklab, ${b} 12%, transparent) 23px 24px)`,
      `radial-gradient(ellipse 70% 90% at 50% 45%, ${glow}, transparent 75%)`,
    ].join(", "),
  };
}
