"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShapeLatticeShape = "square" | "cross" | "arrow";
export type ShapeLatticeColor = "ink" | "accent" | "signal" | "ember";

export type ShapeLatticeProps = {
  /** The content on top of the lattice: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The plate every cell holds. @default "square" */
  shape?: ShapeLatticeShape;
  /** Distance between plate centres, px (12 to 64). @default 26 */
  spacing?: number;
  /** The plates' colour: a named token colour or any CSS colour. @default "ink" */
  color?: ShapeLatticeColor | (string & {});
  /** A plate's size as a share of the spacing (0.2 to 0.95). @default 0.56 */
  size?: number;
  /** How high the hand hovers over the lattice, px: lower turns far plates further onto their edges. @default 150 */
  reach?: number;
  /** How fast the turning travels out from the hand, px/s. @default 420 */
  waveSpeed?: number;
  /** How the plates arrive, 0 (wobbly) to 1 (no overshoot). @default 0.5 */
  damping?: number;
  /** How much the plates catch the light as they turn, 0 (flat) to 1. @default 0.6 */
  light?: number;
  /** With no hand near, a slow light wanders the lattice and the plates track it. @default true */
  wander?: boolean;
  /** A press on the lattice (or keyboard focus arriving inside) sends a ring of plates tumbling over. @default true */
  flip?: boolean;
  /** The pointer and keyboard focus are what the plates turn to face. @default true */
  interactive?: boolean;
  /** Hold the wandering light still; the hand still turns the plates. @default false */
  paused?: boolean;
  /** Seeds the wandering light's path. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) turning the plates. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Text colours, not pigments: the plates are thin marks that need each theme's contrast. */
const COLORS: Record<ShapeLatticeColor, string> = {
  ink: "var(--foreground)",
  accent: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "color-mix(in oklab, var(--danger) 55%, var(--warn))",
};

/** Plate outlines in unit space: x along the way the plate faces, y across it. */
const SHAPES: Record<ShapeLatticeShape, readonly number[]> = {
  square: [-0.82, -0.82, 0.82, -0.82, 0.82, 0.82, -0.82, 0.82],
  cross: [
    -0.3, -1, 0.3, -1, 0.3, -0.3, 1, -0.3, 1, 0.3, 0.3, 0.3, 0.3, 1, -0.3, 1,
    -0.3, 0.3, -1, 0.3, -1, -0.3, -0.3, -0.3,
  ],
  arrow: [
    -1, -0.2, 0.12, -0.2, 0.12, -0.62, 1, 0, 0.12, 0.62, 0.12, 0.2, -1, 0.2,
  ],
};

/** A flip takes this long per plate, s, and its ring runs this much faster than the turning. */
const FLIP = 0.56;
const FLIP_PACE = 1.6;
const FLIPS = 3;
/** History samples per second. */
const RATE = 60;
const STEP = 1 / 120;
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** Five shades of front face and one of back. */
const BUCKETS = 6;
/** The light falls from the upper left, toward the viewer. */
const LIGHT = (() => {
  const v = [-0.45, -0.55, 0.7];
  const n = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((x) => x / n) as [number, number, number];
})();

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The elements a backdrop leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  shape: ShapeLatticeShape;
  spacing: number;
  colorKey: string;
  size: number;
  reach: number;
  waveSpeed: number;
  damping: number;
  light: number;
  wander: boolean;
  flip: boolean;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Lattice = {
  w: number;
  h: number;
  dpr: number;
  n: number;
  cx: Float32Array;
  cy: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Per frame: the facing's angle, its foreshortening and its shade bucket. */
  cos: Float32Array;
  sin: Float32Array;
  fore: Float32Array;
  bucket: Uint8Array;
  /** The hand's path, one sample per 1/60 s, newest at `head`. */
  hx: Float32Array;
  hy: Float32Array;
  ha: Float32Array;
  head: number;
  span: number;
};

type Flip = { x: number; y: number; t0: number; reach: number };

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  flipAt: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carrier: HTMLElement,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  const glow = document.createElement("canvas");
  let cfg: Config | null = null;
  let grid: Lattice | null = null;
  let ink = "rgb(0, 0, 0)";
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  /** Seconds since the start, for the history and the flips. */
  let time = 0;
  let histClock = 0;
  let wanderT = 0;
  let quietSince = 0;
  const flips: Flip[] = Array.from({ length: FLIPS }, () => ({
    x: 0,
    y: 0,
    t0: -99,
    reach: 0,
  }));
  const hand = {
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** The longest any plate waits for the hand's news, s. */
  const maxDelay = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return 0;
    return Math.hypot(g.w, g.h) / Math.max(60, c.waveSpeed);
  };

  /** Where the wandering light is at wander time t. */
  const wanderAt = (t: number) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return { x: 0, y: 0 };
    const rand = lcg(c.seed * 13 + 5);
    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    return {
      x: g.w * (0.5 + 0.38 * Math.sin((t * Math.PI * 2) / 23 + p1)),
      y: g.h * (0.5 + 0.34 * Math.sin((t * Math.PI * 2) / 15 + p2)),
    };
  };

  /** Reduced motion's resting light: upper third, right of centre. */
  const restAt = () => {
    const g = grid;
    return g ? { x: g.w * 0.7, y: g.h * 0.3 } : { x: 0, y: 0 };
  };

  const buildGlow = () => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return;
    const r = Math.max(24, Math.round(c.reach * 1.3 * g.dpr));
    glow.width = r * 2;
    glow.height = r * 2;
    const gc = glow.getContext("2d");
    if (!gc) return;
    gc.clearRect(0, 0, r * 2, r * 2);
    const grad = gc.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, ink);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    gc.globalAlpha = 1;
    gc.fillStyle = grad;
    gc.fillRect(0, 0, r * 2, r * 2);
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const s = clamp(c.spacing, 12, 64);
    const cols = Math.max(1, Math.floor(w / s));
    const rows = Math.max(1, Math.floor(h / s));
    const x0 = (w - (cols - 1) * s) / 2;
    const y0 = (h - (rows - 1) * s) / 2;
    const n = cols * rows;
    const span =
      Math.ceil((Math.hypot(w, h) / Math.max(60, c.waveSpeed)) * RATE) + 4;
    const was = grid;
    const g: Lattice = {
      w,
      h,
      dpr,
      n,
      cx: new Float32Array(n),
      cy: new Float32Array(n),
      ux: new Float32Array(n),
      uy: new Float32Array(n),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      cos: new Float32Array(n),
      sin: new Float32Array(n),
      fore: new Float32Array(n),
      bucket: new Uint8Array(n),
      hx: new Float32Array(span),
      hy: new Float32Array(span),
      ha: new Float32Array(span),
      head: 0,
      span,
    };
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        g.cx[k] = x0 + i * s;
        g.cy[k] = y0 + j * s;
      }
    }
    grid = g;
    // A first lattice starts facing its light; the hand's whole past is
    // where it is now, so a resize sends no wave.
    if (!was && !hand.present) {
      const at = c.motionSafe && c.wander ? wanderAt(wanderT) : restAt();
      hand.x = at.x;
      hand.y = at.y;
      hand.tx = at.x;
      hand.ty = at.y;
      hand.amount = c.motionSafe ? (c.wander ? 0.85 : 0) : 1;
    }
    g.hx.fill(hand.x);
    g.hy.fill(hand.y);
    g.ha.fill(hand.amount);
    settleAll();
    buildGlow();
  };

  /** Every plate straight to where its history says, at rest. */
  const settleAll = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const H = Math.max(20, c.reach);
    for (let k = 0; k < g.n; k += 1) {
      const dx = hand.x - (g.cx[k] ?? 0);
      const dy = hand.y - (g.cy[k] ?? 0);
      const D = Math.sqrt(dx * dx + dy * dy + H * H);
      g.ux[k] = (hand.amount * dx) / D;
      g.uy[k] = (hand.amount * dy) / D;
      g.vx[k] = 0;
      g.vy[k] = 0;
    }
  };

  const readColours = () => {
    ink = getComputedStyle(carrier).color || ink;
    buildGlow();
  };

  /** Writes this frame's hand into the history, one sample per 1/60 s. */
  const record = (dt: number) => {
    const g = grid;
    if (!g) return;
    histClock += dt;
    let pushes = 0;
    while (histClock >= 1 / RATE && pushes < g.span) {
      histClock -= 1 / RATE;
      pushes += 1;
      g.head = (g.head + 1) % g.span;
      g.hx[g.head] = hand.x;
      g.hy[g.head] = hand.y;
      g.ha[g.head] = hand.amount;
    }
  };

  /** Advances the hand, the history, the plates and the flips. Returns whether anything moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    const g = grid;
    if (!c || !g) return false;
    time += dt;
    const wandering = c.wander && !hand.present && !c.paused;
    if (wandering) wanderT += dt;
    if (!hand.present) {
      const at = c.wander ? wanderAt(wanderT) : { x: hand.tx, y: hand.ty };
      hand.tx = at.x;
      hand.ty = at.y;
    }
    const want = hand.present ? 1 : c.wander ? 0.85 : 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.tx - hand.x) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.ty - hand.y) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.x += hand.vx * h;
      hand.y += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
    }
    const handMoving =
      Math.abs(hand.tx - hand.x) + Math.abs(hand.ty - hand.y) > 0.05 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.3;
    if (!handMoving) {
      hand.x = hand.tx;
      hand.y = hand.ty;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.001 || Math.abs(hand.amountV) > 0.005;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    record(dt);
    if (handMoving || arriving || wandering) quietSince = time;

    const H = Math.max(20, c.reach);
    const pace = Math.max(60, c.waveSpeed);
    const zeta = 0.35 + 0.65 * clamp(c.damping, 0, 1);
    const far = 4 * H;
    let residual = 0;
    let flipping = false;
    const { span, head, hx, hy, ha } = g;
    for (let k = 0; k < g.n; k += 1) {
      const px = g.cx[k] ?? 0;
      const py = g.cy[k] ?? 0;
      const ddx = hand.x - px;
      const ddy = hand.y - py;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      // The news of the hand reaches this plate d / pace seconds late.
      const back = Math.min(span - 1, Math.round((d / pace) * RATE));
      const at = (head - back + span) % span;
      const ax = (hx[at] ?? 0) - px;
      const ay = (hy[at] ?? 0) - py;
      const aa = ha[at] ?? 0;
      const D = Math.sqrt(ax * ax + ay * ay + H * H);
      const tx = (aa * ax) / D;
      const ty = (aa * ay) / D;
      // Far plates are softer: they arrive late and gently.
      const stiff = GLIDE.stiffness / (1 + d / far);
      const damp = 2 * zeta * Math.sqrt(stiff);
      let ux = g.ux[k] ?? 0;
      let uy = g.uy[k] ?? 0;
      let vx = g.vx[k] ?? 0;
      let vy = g.vy[k] ?? 0;
      for (let s = 0; s < steps; s += 1) {
        vx += (stiff * (tx - ux) - damp * vx) * h;
        vy += (stiff * (ty - uy) - damp * vy) * h;
        ux += vx * h;
        uy += vy * h;
      }
      const off =
        Math.abs(tx - ux) +
        Math.abs(ty - uy) +
        (Math.abs(vx) + Math.abs(vy)) * 0.02;
      if (off > residual) residual = off;
      g.ux[k] = ux;
      g.uy[k] = uy;
      g.vx[k] = vx;
      g.vy[k] = vy;
    }
    for (const f of flips) {
      const age = time - f.t0;
      if (
        age >= 0 &&
        age * pace * FLIP_PACE < f.reach + pace * FLIP_PACE * FLIP
      )
        flipping = true;
    }
    const histQuiet = time - quietSince > maxDelay() + 0.1;
    return !(residual < 0.0015 && histQuiet && !flipping) || wandering;
  };

  /** Reduced motion: every plate faces the hand (or the resting light) exactly. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    if (!hand.present) {
      const at = restAt();
      hand.tx = at.x;
      hand.ty = at.y;
    }
    hand.x = hand.tx;
    hand.y = hand.ty;
    hand.amount = 1;
    settleAll();
  };

  const draw = () => {
    const c = cfg;
    const g = grid;
    if (!c || !g || !ctx || !visible.current) return;
    const { dpr } = g;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    const lightK = clamp(c.light, 0, 1);
    // The glow under the hand: what the lattice is looking at.
    if (hand.amount > 0.01 && lightK > 0) {
      const r = glow.width / 2 / dpr;
      ctx.globalAlpha = r2(0.06 * lightK * Math.min(1, hand.amount));
      ctx.drawImage(glow, hand.x - r, hand.y - r, r * 2, r * 2);
    }
    const pace = Math.max(60, c.waveSpeed) * FLIP_PACE;
    const R = (clamp(c.size, 0.2, 0.95) * clamp(c.spacing, 12, 64)) / 2;
    for (let k = 0; k < g.n; k += 1) {
      const ux = g.ux[k] ?? 0;
      const uy = g.uy[k] ?? 0;
      // A whisper of the resting heading keeps the angle defined when a
      // plate faces straight up.
      const ex = ux + 0.002;
      const ey = uy;
      const m = Math.min(0.999, Math.hypot(ux, uy));
      const len = Math.hypot(ex, ey) || 1;
      let tilt = Math.asin(m);
      if (c.flip && c.motionSafe) {
        const px = g.cx[k] ?? 0;
        const py = g.cy[k] ?? 0;
        for (const f of flips) {
          const d = Math.hypot(px - f.x, py - f.y);
          if (d > f.reach) continue;
          const p = (time - f.t0 - d / pace) / FLIP;
          if (p > 0 && p < 1) {
            tilt += Math.PI * 2 * easeInOut(p);
            break;
          }
        }
      }
      const fore = Math.cos(tilt);
      const st = Math.sin(tilt);
      const cx = ex / len;
      const sy = ey / len;
      g.cos[k] = cx;
      g.sin[k] = sy;
      g.fore[k] = fore;
      // The plate's normal against the light.
      const b = st * cx * LIGHT[0] + st * sy * LIGHT[1] + fore * LIGHT[2];
      if (fore < 0) {
        g.bucket[k] = BUCKETS - 1;
      } else {
        const shade = clamp((b + 0.15) / 1.1, 0, 0.999);
        const mixed = 0.55 + (shade - 0.55) * lightK;
        g.bucket[k] = Math.floor(clamp(mixed, 0, 0.999) * (BUCKETS - 1));
      }
    }
    const outline = SHAPES[c.shape] ?? SHAPES.square;
    const pts = outline.length / 2;
    ctx.fillStyle = ink;
    for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
      const back = bucket === BUCKETS - 1;
      ctx.globalAlpha = back
        ? 0.13
        : r2(0.16 + 0.46 * ((bucket + 0.5) / (BUCKETS - 1)));
      ctx.beginPath();
      let any = false;
      for (let k = 0; k < g.n; k += 1) {
        if (g.bucket[k] !== bucket) continue;
        any = true;
        const cxk = g.cx[k] ?? 0;
        const cyk = g.cy[k] ?? 0;
        const co = g.cos[k] ?? 1;
        const si = g.sin[k] ?? 0;
        const fo = (g.fore[k] ?? 1) * R;
        for (let p = 0; p < pts; p += 1) {
          const lx = (outline[p * 2] ?? 0) * fo;
          const ly = (outline[p * 2 + 1] ?? 0) * R;
          const x = cxk + lx * co - ly * si;
          const y = cyk + lx * si + ly * co;
          if (p === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      if (any) ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const recentFlip = () => {
    for (const f of flips) if (time - f.t0 < 3) return true;
    return false;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !grid || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    if (!c.motionSafe) {
      place();
      draw();
      last = 0;
      return;
    }
    // While only the wandering light moves, thirty frames a second will do.
    const calm = !hand.present && hand.amountV === 0 && !recentFlip();
    if (calm && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !grid)
      return;
    frame = window.requestAnimationFrame(tick);
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
        readColours();
        layout();
        draw();
        kick();
        return;
      }
      if (
        was.spacing !== next.spacing ||
        was.dpr !== next.dpr ||
        was.waveSpeed !== next.waveSpeed
      ) {
        layout();
      } else if (was.reach !== next.reach) {
        buildGlow();
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (was.motionSafe !== next.motionSafe && next.motionSafe) {
        // Back from the still frame: the past is where the hand is now.
        const g = grid;
        if (g) {
          g.hx.fill(hand.x);
          g.hy.fill(hand.y);
          g.ha.fill(hand.amount);
        }
      }
      quietSince = time;
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      const g = grid;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (
        g &&
        g.w === root.clientWidth &&
        g.h === root.clientHeight &&
        g.dpr === dpr
      )
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
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.tx = x;
      hand.ty = y;
      hand.present = true;
      hand.source = source;
      quietSince = time;
      setActive(true);
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      quietSince = time;
      setActive(false);
      kick();
    },
    flipAt(x, y, strength) {
      const c = cfg;
      const g = grid;
      if (!c || !g || !c.flip || !c.motionSafe) return;
      // A free ring, or else the oldest gives way.
      let pick = flips[0];
      for (const f of flips) if (pick && f.t0 < pick.t0) pick = f;
      if (!pick) return;
      pick.x = x;
      pick.y = y;
      pick.t0 = time;
      pick.reach = Math.hypot(g.w, g.h) * clamp(strength, 0.1, 1);
      quietSince = time;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** The plate's outline as an SVG path about (0, 0), for the server's frame. */
function outlinePath(shape: ShapeLatticeShape, r: number): string {
  const pts = SHAPES[shape] ?? SHAPES.square;
  let d = "";
  for (let p = 0; p < pts.length / 2; p += 1) {
    d += `${p === 0 ? "M" : "L"}${r2((pts[p * 2] ?? 0) * r)} ${r2((pts[p * 2 + 1] ?? 0) * r)}`;
  }
  return `${d}Z`;
}

/**
 * A background lattice of small plates — squares, crosses or arrows — that
 * turn in 3D to face the hand, with the content on top in its own layer.
 * Each plate's normal tips toward a point hovering `reach` px above the hand,
 * so the plates under it look straight up at full size and those further
 * off turn toward it, foreshortened down to slivers: the lattice draws rings
 * around whatever it is looking at.
 *
 * The turning travels: every plate faces where the hand was distance /
 * `waveSpeed` seconds ago, then arrives on its own spring — glide's
 * stiffness softened with distance, damping from `damping` — so a move sends
 * a slow wave of turning across the field. Plates catch a light from the
 * upper left as they turn. With no hand near, a slow light wanders the
 * lattice and the plates track it; the hand's place follows on glide and its
 * presence on drift. A press sends a ring of plates tumbling over (a full
 * flip each, back face dark), and keyboard focus on a control inside brings
 * the hand there with a softer ring. Canvas 2D in six fills a frame; on
 * screen in a visible page only, thirty frames a second while only the
 * wanderer moves. Under reduced motion the plates face a resting light in
 * one still frame and re-face the pointer at once on each move.
 */
export function ShapeLattice({
  children,
  shape = "square",
  spacing = 26,
  color = "ink",
  size = 0.56,
  reach = 150,
  waveSpeed = 420,
  damping = 0.5,
  light = 0.6,
  wander = true,
  flip = true,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: ShapeLatticeProps) {
  const motionSafe = useMotionSafe();
  const ink = COLORS[color as ShapeLatticeColor] ?? color;
  const pitch = clamp(spacing, 12, 64);
  const uid = React.useId();
  const patternId = `shape-lattice-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    shape,
    spacing: pitch,
    colorKey: ink,
    size,
    reach,
    waveSpeed,
    damping,
    light,
    wander,
    flip,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !carrier) return;
    const e = createEngine(root, canvas, carrier, visible);
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
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.flipAt(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.flipAt(at.x, at.y, 0.45);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  const plate = r2((clamp(size, 0.2, 0.95) * pitch) / 2);

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
        // The hand reads the pointer without holding it: the page scrolls.
        "group/shape-lattice relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full group-data-live/shape-lattice:hidden"
        style={{ color: ink }}
      >
        <defs>
          <pattern
            id={patternId}
            width={pitch}
            height={pitch}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={outlinePath(shape, plate)}
              transform={`translate(${r2(pitch / 2)} ${r2(pitch / 2)})`}
              fill="currentColor"
              opacity={0.45}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: ink }}
      />
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
