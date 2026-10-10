"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PixelBloomColor = "cobalt" | "signal" | "ember" | "violet";
export type PixelBloomShape = "circle" | "diamond" | "square";
export type PixelBloomSource = "press" | "linger" | "focus" | "ambient";
export type PixelBloomEvent = {
  /** Where the bloom opened, px from the box's left edge. */
  x: number;
  /** Where the bloom opened, px from the box's top edge. */
  y: number;
  /** What opened it. */
  source: PixelBloomSource;
};

export type PixelBloomProps = {
  /** The content on top of the field: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The pixel pitch in px, 4 to 32. @default 10 */
  pixel?: number;
  /** Page showing between pixels, px. @default 1 */
  gap?: number;
  /** How fast a bloom's ring travels, × 300 px/s, 0.25 to 3. @default 1 */
  speed?: number;
  /** The face a pixel turns over to: a named pigment or any CSS colour. @default "cobalt" */
  color?: PixelBloomColor | (string & {});
  /** How far a bloom turns pixels fully over, px; past it they only tilt. @default 200 */
  reach?: number;
  /** How long a turned pixel rests on its colour before turning home, ms: short makes a ring, long a disc. @default 90 */
  hold?: number;
  /** The ring's outline: round, a diamond or a square. @default "circle" */
  shape?: PixelBloomShape;
  /** A soft bloom opens on its own about this often, ms; 0 for never. @default 4200 */
  ambient?: number;
  /** A pointer resting this long blooms where it rests, ms; 0 for never. @default 650 */
  linger?: number;
  /** Presses, a resting pointer and keyboard focus inside open blooms. @default true */
  interactive?: boolean;
  /** How hard a press blooms, 0 to 1: how far it reaches and how many pixels turn fully. @default 1 */
  pointerStrength?: number;
  /** No blooms of its own; the visitor's still open. @default false */
  paused?: boolean;
  /** Seeds the field's tones, the ring's raggedness and where blooms open by themselves. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A pop for every bloom the visitor opens. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when a bloom opens, with where it opened and what opened it. */
  onBloom?: (bloom: PixelBloomEvent) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Pigments at fixed lightness: a turned pixel is the same colour on a light page and a dark one. */
const COLORS: Record<PixelBloomColor, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.62 c h)",
  signal: "oklch(from var(--signal) 0.76 calc(c * 0.9) h)",
  ember: "oklch(0.7 0.15 48)",
  violet: "oklch(0.62 0.15 298)",
};

/** The page between pixels, then the three resting tones: the page lifted a little toward the ink. */
const GROUND = "var(--background)";
const TONES = [
  "color-mix(in oklab, var(--foreground) 5%, var(--background))",
  "color-mix(in oklab, var(--foreground) 7%, var(--background))",
  "color-mix(in oklab, var(--foreground) 9.5%, var(--background))",
];

/** Tint steps from a resting tone to the face, and shade steps as a pixel turns edge-on. */
const TINTS = 12;
const SHADES = 10;
const FACE_AT = 3 * TINTS * SHADES;
/** An edge-on pixel fades this far into the page: it faces away from the light. */
const EDGE_FADE = 0.6;
/** Ring front at speed 1, px/s. */
const FRONT = 300;
const BLOOMS = 6;
const STEP = 1 / 120;
const TWO_PI = Math.PI * 2;
/**
 * A pixel landing on its colour is a landing, so it recoils (two small
 * bounces on its stop); turning back home glides; a tilt from the ring's
 * outer edge is a quick knock on snap, one small overshoot.
 */
const SPRING = [springs.recoil, springs.glide, springs.snap] as const;
const LAND = 0;
const HOME = 1;
const KNOCK = 2;
/** Angular velocity per unit of amplitude that a knock gives a pixel, rad/s. */
const KICK = 207;
/** Hover tint on the pixel under the pointer and on its four neighbours. */
const HOVER = 0.35;
const NEAR = 0.12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A small seeded generator: the same field for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
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

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** Whether the page has had a click, tap or key yet: sound waits for one. */
const activated = () =>
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation?.hasBeenActive === true;

type Config = {
  pitch: number;
  gap: number;
  speed: number;
  colorKey: string;
  reach: number;
  hold: number;
  shape: PixelBloomShape;
  ambient: number;
  linger: number;
  interactive: boolean;
  strength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onBloom: (bloom: PixelBloomEvent) => void;
};

type Grid = {
  w: number;
  h: number;
  dpr: number;
  pitch: number;
  cols: number;
  rows: number;
  n: number;
  /** Each column's and row's drawn edges, snapped to device pixels, and its centre. */
  x0: Float32Array;
  x1: Float32Array;
  y0: Float32Array;
  y1: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  /** Per pixel: its angle, spin, the angle it is heading for and which spring takes it there. */
  theta: Float32Array;
  omega: Float32Array;
  target: Float32Array;
  spring: Uint8Array;
  /** When a turned pixel starts home, ms on the page clock; 0 for no hold. */
  hold: Float64Array;
  /** 0 turns about a vertical axis (width shrinks), 1 about a horizontal one. */
  axis: Uint8Array;
  tone: Uint8Array;
  /** Seeded −0.5…0.5: how far ahead or behind the front each pixel turns. */
  jitter: Float32Array;
  tint: Float32Array;
  tintTo: Float32Array;
  /** Reduced motion: how far toward the colour a press has lit it, and the still frame's own. */
  lit: Float32Array;
  still: Float32Array;
  active: Uint8Array;
  list: Int32Array;
  count: number;
};

type Bloom = {
  on: boolean;
  x: number;
  y: number;
  r: number;
  strength: number;
  reach: number;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  hover: (x: number, y: number) => void;
  leave: () => void;
  bloom: (
    x: number,
    y: number,
    strength: number,
    source: PixelBloomSource,
  ) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let grid: Grid | null = null;
  const ctx = canvas.getContext("2d", { alpha: false });
  const base = document.createElement("canvas");
  const baseCtx = base.getContext("2d", { alpha: false });
  let frame = 0;
  let last = 0;
  let disposed = false;
  let dueTimer = 0;
  let ambientTimer = 0;
  let ambientPending = false;
  let lingerTimer = 0;
  let nextDue = Infinity;
  let wander = lcg(1);
  const read = rgbReader();
  /** Ground, three tones and the face, as sRGB bytes. */
  const rgb = new Float32Array(15);
  const lut: string[] = [];
  let groundCss = "rgb(0, 0, 0)";
  const blooms: Bloom[] = Array.from({ length: BLOOMS }, () => ({
    on: false,
    x: 0,
    y: 0,
    r: 0,
    strength: 0,
    reach: 0,
  }));
  const hand = {
    present: false,
    x: 0,
    y: 0,
    cell: -1,
    ax: 0,
    ay: 0,
    armed: false,
    near: new Int32Array(5).fill(-1),
  };

  const activate = (k: number) => {
    const g = grid;
    if (!g || g.active[k]) return;
    g.active[k] = 1;
    g.list[g.count] = k;
    g.count += 1;
  };

  /** Builds the colour strings once per palette or theme, never per frame. */
  const buildLut = () => {
    lut.length = 0;
    const gr = rgb[0] ?? 0;
    const gg = rgb[1] ?? 0;
    const gb = rgb[2] ?? 0;
    const fr = rgb[12] ?? 0;
    const fg = rgb[13] ?? 0;
    const fb = rgb[14] ?? 0;
    const css = (r: number, g: number, b: number, s: number) => {
      const k = (EDGE_FADE * s) / (SHADES - 1);
      return `rgb(${Math.round(r + (gr - r) * k)}, ${Math.round(g + (gg - g) * k)}, ${Math.round(b + (gb - b) * k)})`;
    };
    for (let t = 0; t < 3; t += 1) {
      const r = rgb[3 + t * 3] ?? 0;
      const g = rgb[4 + t * 3] ?? 0;
      const b = rgb[5 + t * 3] ?? 0;
      for (let l = 0; l < TINTS; l += 1) {
        const m = l / (TINTS - 1);
        for (let s = 0; s < SHADES; s += 1) {
          lut.push(
            css(r + (fr - r) * m, g + (fg - g) * m, b + (fb - b) * m, s),
          );
        }
      }
    }
    for (let s = 0; s < SHADES; s += 1) lut.push(css(fr, fg, fb, s));
    groundCss = `rgb(${gr}, ${gg}, ${gb})`;
  };

  /** How far a cell centre is from a bloom, in the ring's own metric. */
  const metric = (dx: number, dy: number) => {
    const shape = cfg?.shape ?? "circle";
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (shape === "diamond") return (ax + ay) * 0.75;
    if (shape === "square") return Math.max(ax, ay);
    return Math.sqrt(dx * dx + dy * dy);
  };

  /** Reduced motion's still frame: one bloom caught mid-flight. */
  const composeStill = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    g.still.fill(0);
    if (c.motionSafe) return;
    const rand = lcg(c.seed * 17 + 3);
    const bx = g.w * (0.62 + rand() * 0.16);
    const by = g.h * (0.38 + rand() * 0.24);
    const ring = Math.max(g.pitch * 3, Math.min(c.reach, g.h * 0.9) * 0.55);
    for (let j = 0; j < g.rows; j += 1) {
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        const d =
          metric((g.cx[i] ?? 0) - bx, (g.cy[j] ?? 0) - by) +
          (g.jitter[k] ?? 0) * g.pitch * 0.9;
        const off = d - ring;
        if (off > -g.pitch * 0.9 && off < g.pitch * 0.7) g.still[k] = 1;
        else if (off > -g.pitch * 2.4 && off <= -g.pitch * 0.9)
          g.still[k] = 0.4;
        else if (d < ring && (g.jitter[k] ?? 0) > 0.36) g.still[k] = 0.22;
      }
    }
  };

  /** The resting field, drawn once per layout, palette or theme. */
  const drawBase = () => {
    const g = grid;
    if (!g || !baseCtx || lut.length === 0) return;
    base.width = Math.max(1, Math.round(g.w * g.dpr));
    base.height = Math.max(1, Math.round(g.h * g.dpr));
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.fillStyle = groundCss;
    baseCtx.fillRect(0, 0, base.width, base.height);
    baseCtx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    let style = "";
    for (let j = 0; j < g.rows; j += 1) {
      const y0 = g.y0[j] ?? 0;
      const y1 = g.y1[j] ?? 0;
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        const level = Math.round(clamp(g.still[k] ?? 0, 0, 1) * (TINTS - 1));
        const next =
          level === TINTS - 1
            ? (lut[FACE_AT] ?? groundCss)
            : (lut[((g.tone[k] ?? 0) * TINTS + level) * SHADES] ?? groundCss);
        if (next !== style) {
          style = next;
          baseCtx.fillStyle = style;
        }
        const x0 = g.x0[i] ?? 0;
        baseCtx.fillRect(x0, y0, (g.x1[i] ?? 0) - x0, y1 - y0);
      }
    }
  };

  const layout = (): boolean => {
    const c = cfg;
    if (!c) return false;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const pitch = c.pitch;
    const gap = clamp(c.gap, 0, pitch * 0.3);
    // One pixel sits dead centre, so the cut at every edge is even.
    const kx = Math.ceil((w / 2 - pitch / 2) / pitch);
    const ky = Math.ceil((h / 2 - pitch / 2) / pitch);
    const ox = w / 2 - pitch / 2 - kx * pitch;
    const oy = h / 2 - pitch / 2 - ky * pitch;
    const cols = Math.ceil((w - ox) / pitch);
    const rows = Math.ceil((h - oy) / pitch);
    const n = cols * rows;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    const x0 = new Float32Array(cols);
    const x1 = new Float32Array(cols);
    const cx = new Float32Array(cols);
    for (let i = 0; i < cols; i += 1) {
      x0[i] = snap(ox + i * pitch + gap / 2);
      x1[i] = snap(ox + (i + 1) * pitch - gap / 2);
      cx[i] = ox + (i + 0.5) * pitch;
    }
    const y0 = new Float32Array(rows);
    const y1 = new Float32Array(rows);
    const cy = new Float32Array(rows);
    for (let j = 0; j < rows; j += 1) {
      y0[j] = snap(oy + j * pitch + gap / 2);
      y1[j] = snap(oy + (j + 1) * pitch - gap / 2);
      cy[j] = oy + (j + 0.5) * pitch;
    }
    const rand = lcg(c.seed);
    const tone = new Uint8Array(n);
    const jitter = new Float32Array(n);
    for (let k = 0; k < n; k += 1) {
      const t = rand();
      tone[k] = t < 0.5 ? 1 : t < 0.78 ? 0 : 2;
      jitter[k] = rand() - 0.5;
    }
    grid = {
      w,
      h,
      dpr,
      pitch,
      cols,
      rows,
      n,
      x0,
      x1,
      y0,
      y1,
      cx,
      cy,
      theta: new Float32Array(n),
      omega: new Float32Array(n),
      target: new Float32Array(n),
      spring: new Uint8Array(n),
      hold: new Float64Array(n),
      axis: new Uint8Array(n),
      tone,
      jitter,
      tint: new Float32Array(n),
      tintTo: new Float32Array(n),
      lit: new Float32Array(n),
      still: new Float32Array(n),
      active: new Uint8Array(n),
      list: new Int32Array(n),
      count: 0,
    };
    for (const b of blooms) b.on = false;
    hand.cell = -1;
    hand.near.fill(-1);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    composeStill();
    drawBase();
    return true;
  };

  /** One pixel as it stands this frame: its cell cleared to the page, then its face. */
  const drawCell = (g: Grid, k: number) => {
    if (!ctx) return;
    const i = k % g.cols;
    const j = (k - i) / g.cols;
    const x0 = g.x0[i] ?? 0;
    const y0 = g.y0[j] ?? 0;
    const cw = (g.x1[i] ?? 0) - x0;
    const ch = (g.y1[j] ?? 0) - y0;
    const cs = Math.cos(g.theta[k] ?? 0);
    const ac = Math.abs(cs);
    if (ac < 0.999) {
      ctx.fillStyle = groundCss;
      ctx.fillRect(x0, y0, cw, ch);
    }
    if (ac < 0.035) return;
    const shade = Math.round((1 - ac) * (SHADES - 1));
    let at: number;
    if (cs < 0) at = FACE_AT + shade;
    else {
      const glow = Math.max(g.tint[k] ?? 0, g.lit[k] ?? 0, g.still[k] ?? 0);
      const level = Math.round(clamp(glow, 0, 1) * (TINTS - 1));
      at =
        level === TINTS - 1
          ? FACE_AT + shade
          : ((g.tone[k] ?? 0) * TINTS + level) * SHADES + shade;
    }
    ctx.fillStyle = lut[at] ?? groundCss;
    if (ac > 0.999) ctx.fillRect(x0, y0, cw, ch);
    else if (g.axis[k] === 0) {
      const wf = cw * ac;
      ctx.fillRect(x0 + (cw - wf) / 2, y0, wf, ch);
    } else {
      const hf = ch * ac;
      ctx.fillRect(x0, y0 + (ch - hf) / 2, cw, hf);
    }
  };

  const draw = () => {
    const g = grid;
    if (!g || !ctx || !visible.current || lut.length === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    for (let a = 0; a < g.count; a += 1) drawCell(g, g.list[a] ?? 0);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** A bloom's front reaches pixel k with amplitude a: it turns over, or is knocked. */
  const strike = (
    k: number,
    a: number,
    dx: number,
    dy: number,
    now: number,
  ) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const th = g.theta[k] ?? 0;
    const T = g.target[k] ?? 0;
    const settled = th === T && (g.omega[k] ?? 0) === 0;
    if (settled) g.axis[k] = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
    const turned = Math.round(T / Math.PI) % 2 === 1;
    // A short hold turns the pixel home while it is still landing, so it
    // spins once through its colour and the bloom reads as a ring; a long
    // one lets it land (and recoil) first, and the bloom fills in.
    const holdFor = c.hold + 60 + (g.jitter[k] ?? 0) * 40;
    if (a >= 0.5) {
      if (turned) {
        // Already showing its colour: it stays a while longer and twitches.
        g.hold[k] = Math.max(g.hold[k] ?? 0, now + holdFor);
        g.omega[k] = (g.omega[k] ?? 0) + 4;
      } else {
        // Over it goes, always the same way round, so the way home is a
        // second half-turn forward rather than a reversal.
        g.target[k] = (Math.round(T / Math.PI) + 1) * Math.PI;
        g.spring[k] = LAND;
        g.hold[k] = now + holdFor;
      }
    } else if (a >= 0.05) {
      if (settled) g.spring[k] = KNOCK;
      g.omega[k] = (g.omega[k] ?? 0) + a * KICK * (settled ? 1 : 0.4);
    } else return;
    activate(k);
  };

  /** The cells a front passes between radius r0 and r1 this frame. */
  const sweep = (b: Bloom, r0: number, r1: number, now: number) => {
    const g = grid;
    if (!g) return;
    const p = g.pitch;
    const span = r1 + p;
    const ox = (g.cx[0] ?? 0) - p / 2;
    const oy = (g.cy[0] ?? 0) - p / 2;
    const i0 = clamp(Math.floor((b.x - span - ox) / p), 0, g.cols - 1);
    const i1 = clamp(Math.ceil((b.x + span - ox) / p), 0, g.cols - 1);
    const j0 = clamp(Math.floor((b.y - span - oy) / p), 0, g.rows - 1);
    const j1 = clamp(Math.ceil((b.y + span - oy) / p), 0, g.rows - 1);
    const inv = 1 / (b.reach * b.reach);
    for (let j = j0; j <= j1; j += 1) {
      const dy = (g.cy[j] ?? 0) - b.y;
      for (let i = i0; i <= i1; i += 1) {
        const k = j * g.cols + i;
        const dx = (g.cx[i] ?? 0) - b.x;
        const d = metric(dx, dy) + (g.jitter[k] ?? 0) * p * 0.9;
        if (d < r0 || d >= r1) continue;
        const dd = Math.max(0, d);
        strike(k, b.strength * Math.exp(-dd * dd * inv), dx, dy, now);
      }
    }
  };

  /** Advances the fronts and every active pixel. Returns whether anything still moves. */
  const step = (dt: number, now: number): boolean => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return false;
    let moving = false;
    nextDue = Infinity;
    const v = FRONT * clamp(c.speed, 0.25, 3);
    for (const b of blooms) {
      if (!b.on) continue;
      moving = true;
      const r0 = b.r;
      const r1 = r0 + v * dt;
      b.r = r1;
      sweep(b, r0, r1, now);
      if (r0 > b.reach * 1.9) b.on = false;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const safe = c.motionSafe;
    const rise = safe ? 1 - Math.exp(-dt / 0.06) : 1;
    const fall = safe ? 1 - Math.exp(-dt / 0.3) : 1;
    let a = 0;
    while (a < g.count) {
      const k = g.list[a] ?? 0;
      let hold = g.hold[k] ?? 0;
      if (hold > 0 && now >= hold) {
        hold = 0;
        g.hold[k] = 0;
        if (safe) {
          g.target[k] = (g.target[k] ?? 0) + Math.PI;
          g.spring[k] = HOME;
        }
      }
      let th = g.theta[k] ?? 0;
      let om = g.omega[k] ?? 0;
      let T = g.target[k] ?? 0;
      if (th !== T || om !== 0) {
        const sp = SPRING[g.spring[k] ?? HOME] ?? springs.glide;
        const ks = sp.stiffness / sp.mass;
        const kd = sp.damping / sp.mass;
        for (let s = 0; s < steps; s += 1) {
          om += (-ks * (th - T) - kd * om) * h;
          th += om * h;
        }
        if (Math.abs(th - T) < 0.003 && Math.abs(om) < 0.03) {
          th = T;
          om = 0;
          if (T >= TWO_PI - 1e-4) {
            th -= TWO_PI;
            T -= TWO_PI;
            g.target[k] = T;
          }
        } else moving = true;
        g.theta[k] = th;
        g.omega[k] = om;
      }
      const to = g.tintTo[k] ?? 0;
      let tn = g.tint[k] ?? 0;
      if (tn !== to) {
        tn += (to - tn) * (to > tn ? rise : fall);
        if (Math.abs(to - tn) < 0.004) tn = to;
        else moving = true;
        g.tint[k] = tn;
      }
      let lit = g.lit[k] ?? 0;
      if (lit > 0 && hold === 0) {
        // Reduced motion: a lit pixel fades home by colour alone.
        lit = Math.max(0, lit - dt / 0.6);
        g.lit[k] = lit;
        if (lit > 0) moving = true;
      }
      if (hold > 0) nextDue = Math.min(nextDue, hold);
      const alive =
        hold > 0 || th !== 0 || om !== 0 || T !== 0 || tn !== 0 || to !== 0;
      if (alive || lit > 0) a += 1;
      else {
        g.count -= 1;
        g.list[a] = g.list[g.count] ?? 0;
        g.active[k] = 0;
      }
    }
    return moving;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!grid || !ctx) return;
    window.clearTimeout(dueTimer);
    dueTimer = 0;
    frame = window.requestAnimationFrame(tick);
  };

  function tick(now: number) {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !grid) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt, now);
    draw();
    if (moving) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    last = 0;
    // Pixels holding their colour wait on one timer, not on frames.
    if (nextDue < Infinity) {
      dueTimer = window.setTimeout(
        () => {
          dueTimer = 0;
          kick();
        },
        Math.max(0, nextDue - performance.now()),
      );
    }
  }

  const open = (x: number, y: number, strength: number) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const reach = Math.max(g.pitch * 2, c.reach) * (0.55 + 0.45 * strength);
    if (!c.motionSafe) {
      // Reduced motion: no travelling ring, no turning — every pixel in
      // reach takes its colour at once, by amplitude, and fades by colour.
      const now = performance.now();
      const inv = 1 / (reach * reach);
      for (let j = 0; j < g.rows; j += 1) {
        for (let i = 0; i < g.cols; i += 1) {
          const k = j * g.cols + i;
          const d = Math.max(
            0,
            metric((g.cx[i] ?? 0) - x, (g.cy[j] ?? 0) - y) +
              (g.jitter[k] ?? 0) * g.pitch * 0.9,
          );
          const amp = strength * Math.exp(-d * d * inv);
          if (amp < 0.05) continue;
          g.lit[k] = Math.max(g.lit[k] ?? 0, amp >= 0.5 ? 1 : amp * 1.6);
          g.hold[k] = Math.max(g.hold[k] ?? 0, now + Math.max(400, c.hold));
          activate(k);
        }
      }
      kick();
      return;
    }
    let pick = blooms[0];
    for (const b of blooms) {
      if (!b.on) {
        pick = b;
        break;
      }
      if (pick && b.r > pick.r) pick = b;
    }
    if (!pick) return;
    pick.on = true;
    pick.x = x;
    pick.y = y;
    pick.r = -g.pitch;
    pick.strength = strength;
    pick.reach = reach;
    kick();
  };

  const scheduleAmbient = (delay?: number) => {
    window.clearTimeout(ambientTimer);
    ambientTimer = 0;
    const c = cfg;
    if (disposed || !c || c.paused || !c.motionSafe || c.ambient <= 0) return;
    const wait = delay ?? c.ambient * (0.65 + 0.7 * wander());
    ambientTimer = window.setTimeout(() => {
      ambientTimer = 0;
      if (!visible.current || document.hidden) {
        // Off screen, nothing blooms; the next one waits to be seen.
        ambientPending = true;
        return;
      }
      openAmbient();
      scheduleAmbient();
    }, wait);
  };

  const openAmbient = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const x = g.w * (0.12 + 0.76 * wander());
    const y = g.h * (0.18 + 0.64 * wander());
    open(x, y, 0.62);
    c.onBloom({ x: Math.round(x), y: Math.round(y), source: "ambient" });
  };

  const setHover = (k: number) => {
    const g = grid;
    if (!g) return;
    for (const old of hand.near) {
      if (old >= 0) {
        g.tintTo[old] = 0;
        activate(old);
      }
    }
    hand.near.fill(-1);
    hand.cell = k;
    if (k < 0) return;
    const i = k % g.cols;
    const j = (k - i) / g.cols;
    const around: [number, number, number][] = [
      [i, j, HOVER],
      [i - 1, j, NEAR],
      [i + 1, j, NEAR],
      [i, j - 1, NEAR],
      [i, j + 1, NEAR],
    ];
    around.forEach(([ii, jj, level], slot) => {
      if (ii < 0 || jj < 0 || ii >= g.cols || jj >= g.rows) return;
      const kk = jj * g.cols + ii;
      g.tintTo[kk] = level;
      hand.near[slot] = kk;
      activate(kk);
    });
  };

  const stopLinger = () => {
    window.clearTimeout(lingerTimer);
    lingerTimer = 0;
  };

  const startLinger = () => {
    stopLinger();
    const c = cfg;
    if (!c || c.linger <= 0 || !hand.armed) return;
    lingerTimer = window.setTimeout(() => {
      lingerTimer = 0;
      const now = cfg;
      if (!now || !now.interactive || !hand.present || !hand.armed) return;
      hand.armed = false;
      open(hand.ax, hand.ay, 0.75 * clamp(now.strength, 0.2, 1));
      now.onBloom({
        x: Math.round(hand.ax),
        y: Math.round(hand.ay),
        source: "linger",
      });
    }, c.linger);
  };

  const readColoursNow = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, rgb, i * 3);
    }
    buildLut();
  };

  const leave = () => {
    hand.present = false;
    hand.armed = false;
    stopLinger();
    setHover(-1);
    kick();
  };

  // A 2D canvas the browser dropped under memory pressure comes back
  // blank: paint it again.
  const onRestored = () => {
    if (ctx) {
      drawBase();
      draw();
    }
  };
  canvas.addEventListener("contextrestored", onRestored);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx || !baseCtx) {
        // No 2D canvas at all: the CSS still frame stays.
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        wander = lcg(next.seed * 31 + 7);
        readColoursNow();
        if (layout()) draw();
        // The first bloom opens a moment after the field is first seen.
        scheduleAmbient(700);
        return;
      }
      if (was.seed !== next.seed) wander = lcg(next.seed * 31 + 7);
      if (was.colorKey !== next.colorKey) readColoursNow();
      if (
        was.pitch !== next.pitch ||
        was.gap !== next.gap ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed ||
        was.motionSafe !== next.motionSafe
      ) {
        layout();
      } else if (
        !next.motionSafe &&
        (was.reach !== next.reach || was.shape !== next.shape)
      ) {
        composeStill();
        drawBase();
      } else if (was.colorKey !== next.colorKey) drawBase();
      if (!next.interactive && hand.present) leave();
      if (
        was.paused !== next.paused ||
        was.ambient !== next.ambient ||
        was.motionSafe !== next.motionSafe
      ) {
        ambientPending = false;
        scheduleAmbient(900);
      }
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c || !ctx) return;
      const g = grid;
      const w = root.clientWidth;
      const h = root.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (g && g.w === w && g.h === h && g.dpr === dpr) return;
      if (layout()) {
        draw();
        kick();
      }
    },
    readColours() {
      readColoursNow();
      drawBase();
      draw();
    },
    wake() {
      draw();
      kick();
      if (ambientPending) {
        ambientPending = false;
        openAmbient();
        scheduleAmbient();
      }
    },
    hover(x, y) {
      const g = grid;
      const c = cfg;
      if (!g || !c || !c.interactive) return;
      const entering = !hand.present;
      hand.present = true;
      hand.x = x;
      hand.y = y;
      const p = g.pitch;
      const i = Math.floor((x - ((g.cx[0] ?? 0) - p / 2)) / p);
      const j = Math.floor((y - ((g.cy[0] ?? 0) - p / 2)) / p);
      const k =
        i >= 0 && j >= 0 && i < g.cols && j < g.rows ? j * g.cols + i : -1;
      if (k !== hand.cell) {
        setHover(k);
        kick();
      }
      const room = Math.max(6, p * 1.5);
      const dx = x - hand.ax;
      const dy = y - hand.ay;
      if (entering || dx * dx + dy * dy > room * room) {
        // A resting pointer blooms once; it has to move to bloom again.
        hand.ax = x;
        hand.ay = y;
        hand.armed = true;
        startLinger();
      }
    },
    leave,
    bloom(x, y, strength, source) {
      const c = cfg;
      if (!c || !grid) return;
      if (source === "press") {
        // The press has bloomed here; resting on the same spot is not a
        // second bloom until the pointer moves on.
        hand.armed = false;
        stopLinger();
      }
      open(x, y, clamp(strength, 0.2, 1));
      c.onBloom({ x: Math.round(x), y: Math.round(y), source });
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener("contextrestored", onRestored);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(dueTimer);
      window.clearTimeout(ambientTimer);
      stopLinger();
    },
  };
}

/**
 * A background of square pixels that bloom: a quiet field — the page lifted
 * a little toward the ink in three seeded tones — with the content on top in
 * its own layer. A bloom is a ring that leaves a point and runs outward;
 * every pixel it reaches turns over about the axis facing the source, so the
 * ring falls like a line of dominoes. Near the source a pixel turns right
 * over to its colour, landing on the recoil spring with two small bounces on
 * its stop, holds, and turns on home on the glide spring — the same hold
 * everywhere, so a second, slower ring follows the first out. Further away the
 * ring only knocks pixels on the snap spring: they tilt, flash an edge of
 * colour and fall back, so a bloom fades into the field instead of ending at
 * a line. Each pixel turns a little ahead of or behind the front, so the ring
 * is ragged, like something grown.
 *
 * A press blooms, a pointer that rests a moment blooms where it rests, the
 * pixel under a hovering pointer warms toward the colour, and every few
 * seconds a soft bloom opens on its own. Keyboard focus on a control inside
 * blooms from the control. Canvas 2D: the resting field is drawn once and a
 * frame is one blit plus the pixels that are moving; the loop stops when they
 * stop, and nothing runs off screen. Under reduced motion one bloom is held
 * still mid-flight, and a press lights every pixel in reach at once and fades
 * it back by colour.
 */
export function PixelBloom({
  children,
  pixel = 10,
  gap = 1,
  speed = 1,
  color = "cobalt",
  reach = 200,
  hold = 90,
  shape = "circle",
  ambient = 4200,
  linger = 650,
  interactive = true,
  pointerStrength = 1,
  paused = false,
  seed = 1,
  dpr = 2,
  sound = false,
  onBloom,
  className,
}: PixelBloomProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const face = COLORS[color as PixelBloomColor] ?? color;
  const pitch = clamp(Math.round(pixel), 4, 32);
  const gapPx = clamp(gap, 0, pitch * 0.3);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onBloom);
  const voice = React.useRef({ audio, pitch });

  const config: Config = {
    pitch,
    gap: gapPx,
    speed,
    colorKey: face,
    reach,
    hold,
    shape,
    ambient,
    linger,
    interactive,
    strength: pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onBloom: (bloom) => {
      report.current?.(bloom);
      // Sound answers the visitor only, and only once the page has been
      // clicked, tapped or keyed: a bloom from a resting pointer or the
      // field's own clock is never the first sound a page makes.
      if (bloom.source === "ambient" || !activated()) return;
      const root = rootRef.current;
      const rect = root?.getBoundingClientRect();
      const { audio: a, pitch: p } = voice.current;
      a.play("pop", {
        pitch: 1.3 - ((p - 4) / 28) * 0.55,
        gain:
          bloom.source === "press"
            ? 0.55
            : bloom.source === "focus"
              ? 0.4
              : 0.3,
        pan: rect ? panFrom(rect.left + bloom.x, root) : 0,
      });
    },
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onBloom;
    voice.current = { audio, pitch };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
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

  // Size and sighting, bound to the node when it arrives.
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
    // A finger has no hover: it blooms where it lands, and that is all.
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.hover(at.x, at.y);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only the field blooms.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.bloom(at.x, at.y, pointerStrength, "press");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.leave();
  };

  // Keyboard focus on a control inside blooms from the control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.bloom(at.x, at.y, 0.85 * pointerStrength, "focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        "group/pixel-bloom relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/pixel-bloom:opacity-0"
        style={standIn(face, pitch, gapPx)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[GROUND, ...TONES, face].map((paint, i) => (
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
 * resting field in CSS, one pixel centred like the canvas's, with a ring of
 * colour opening off to the right.
 */
function standIn(
  face: string,
  pitch: number,
  gap: number,
): React.CSSProperties {
  const half = Math.round(gap * 50) / 100;
  const far = Math.round((pitch - half) * 100) / 100;
  const rest = TONES[1] ?? GROUND;
  const lines = (deg: number) =>
    `linear-gradient(${deg}deg, ${GROUND} ${half}px, transparent ${half}px, transparent ${far}px, ${GROUND} ${far}px)`;
  const ring = `color-mix(in oklab, ${face} 80%, ${rest})`;
  const soft = `color-mix(in oklab, ${face} 30%, ${rest})`;
  return {
    backgroundColor: rest,
    backgroundImage: [
      lines(90),
      lines(180),
      `radial-gradient(circle at 70% 50%, transparent 0 46px, ${soft} 47px 56px, ${ring} 57px 66px, transparent 67px)`,
    ].join(", "),
    backgroundSize: `${pitch}px ${pitch}px, ${pitch}px ${pitch}px, 100% 100%`,
    backgroundPosition: "center, center, 0 0",
  };
}
