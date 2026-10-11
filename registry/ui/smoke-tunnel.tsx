"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SmokeTunnelProps = {
  /** The tunnel's speed, 0 (a slow drift) to 1 (a brisk run): the puffs, the dust and the turbulence. @default 0.5 */
  flow?: number;
  /** The wing's angle of attack where it starts, in degrees; changing it turns the wing there. @default 6 */
  angle?: number;
  /** How much smoke the rake lets out, 0 (a few faint threads) to 1 (many dense ones). @default 0.6 */
  smoke?: number;
  /** The wing's angle when you control it, in degrees; pair with `onValueChange`. */
  value?: number;
  /** Fires from the drag or the keys that turned the wing, with its new angle in degrees. */
  onValueChange?: (degrees: number) => void;
  /** The lowest angle the wing turns to, in degrees. @default -10 */
  minAngle?: number;
  /** The highest angle the wing turns to, in degrees. @default 26 */
  maxAngle?: number;
  /** The angle past which the flow over the top lets go and the smoke tumbles, in degrees. @default 14 */
  stallAngle?: number;
  /** How arched the wing's section is, 0 (symmetric) to 1. @default 0.5 */
  camber?: number;
  /** How thick the wing's section is, 0 (thin) to 1 (thick). @default 0.5 */
  thickness?: number;
  /** How strongly the tube of haze winds off the tip, 0 (none) to 1. @default 0.6 */
  vortex?: number;
  /** The smoke's colour, any CSS colour; resolved on the element so it follows the theme. @default "var(--foreground)" */
  smokeColor?: string;
  /** The model's colour, any CSS colour. @default "var(--ink-2)" */
  modelColor?: string;
  /** Content above the tunnel: a caption, a heading, a call to action. */
  children?: React.ReactNode;
  /** The drag and keys turn the wing. @default true */
  interactive?: boolean;
  /** Stop the smoke where it is; the wing still turns. @default false */
  paused?: boolean;
  /** Names the wing's angle control for assistive technology. @default "Wing angle" */
  label?: string;
  /** Seeds the turbulence and the dust, so two tunnels never tumble alike. @default 8 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the flow stalls (true) or attaches again (false), from the drag or keys that caused it. */
  onStallChange?: (stalled: boolean) => void;
  /** Shows the tunnel running but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const MAX_LINES = 34;
const MAX_PTS = 600;
const DS = 2.5;
const DUST = 36;
const EDDIES = 5;
const OUTLINE = 96;
const UPPER = 48;
const STEP = 1 / 120;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small seeded generator: the same dust and turbulence for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Smooth value noise on a seeded lattice, for the turbulence's curl. */
function noiseOf(seed: number) {
  const rand = lcg(seed * 7 + 3);
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) table[i] = rand();
  const at = (x: number, y: number) =>
    table[(((x * 73856093) ^ (y * 19349663)) >>> 0) & 255]!;
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** The section: a Joukowski aerofoil from a circle through ζ = 1. */
type Section = {
  /** The circle's centre (μ) and radius in the ζ-plane. */
  mx: number;
  my: number;
  a: number;
  /** Where the leading edge and the quarter chord sit on the real axis of z. */
  le: number;
  quarter: number;
  chord: number;
};

function sectionOf(camber: number, thickness: number): Section {
  const mx = -(0.03 + 0.1 * thickness);
  const my = 0.13 * camber;
  const a = Math.hypot(1 - mx, my);
  const lx = mx - a;
  const le = lx + 1 / lx;
  const chord = 2 - le;
  return { mx, my, a, le, quarter: le + chord * 0.25, chord };
}

/**
 * The flow through the tunnel, in the box's px: the wing's pivot, its size
 * and its angle map a point into the aerofoil's plane, where the potential
 * flow with the Kutta circulation is solved in closed form. Velocities come
 * back in units of the free stream, turned back into the box.
 */
type Field = {
  sec: Section;
  px: number;
  py: number;
  /** z units per px. */
  k: number;
  ca: number;
  sa: number;
  /** Circulation over 2π. */
  gam: number;
};

function fieldOf(
  sec: Section,
  px: number,
  py: number,
  chordPx: number,
  alpha: number,
): Field {
  const beta = Math.atan2(sec.my, 1 - sec.mx);
  const gam = 2 * sec.a * Math.sin(alpha + beta);
  return {
    sec,
    px,
    py,
    k: sec.chord / chordPx,
    ca: Math.cos(alpha),
    sa: Math.sin(alpha),
    gam,
  };
}

const flowOut = { vx: 0, vy: 0, speed: 0, inside: false, zx: 0, zy: 0 };

/** The velocity at (x, y) in the box, and whether the point is inside the wing. */
function flowAt(f: Field, x: number, y: number) {
  const { sec, ca, sa } = f;
  const mx0 = (x - f.px) * f.k;
  const my0 = (f.py - y) * f.k;
  const zx = mx0 * ca - my0 * sa + sec.quarter;
  const zy = mx0 * sa + my0 * ca;
  // ζ from z: the root of ζ² − zζ + 1 = 0 that lies outside the circle.
  const qx = zx * zx - zy * zy - 4;
  const qy = 2 * zx * zy;
  const qm = Math.hypot(qx, qy);
  let sx = Math.sqrt(Math.max(0, (qm + qx) / 2));
  let sy = Math.sqrt(Math.max(0, (qm - qx) / 2));
  if (qy < 0) sy = -sy;
  const ax = (zx + sx) / 2 - sec.mx;
  const ay = (zy + sy) / 2 - sec.my;
  const bx = (zx - sx) / 2 - sec.mx;
  const by = (zy - sy) / 2 - sec.my;
  let wx = ax;
  let wy = ay;
  if (bx * bx + by * by > ax * ax + ay * ay) {
    wx = bx;
    wy = by;
    sx = -sx;
    sy = -sy;
  }
  const r2 = wx * wx + wy * wy;
  flowOut.inside = r2 < sec.a * sec.a;
  flowOut.zx = wx;
  flowOut.zy = wy;
  // dW/dζ = e^{-iα} − a² e^{iα} / w² + iΓ / (2π w)
  const inv2 = 1 / Math.max(1e-9, r2 * r2);
  const w2x = (wx * wx - wy * wy) * inv2;
  const w2y = -2 * wx * wy * inv2;
  const a2 = sec.a * sec.a;
  const tx = a2 * (ca * w2x - sa * w2y);
  const ty = a2 * (ca * w2y + sa * w2x);
  const invr = 1 / Math.max(1e-9, r2);
  const gx = f.gam * (wy * invr);
  const gy = f.gam * (wx * invr);
  const dWx = ca - tx + gx;
  const dWy = -sa - ty + gy;
  // dz/dζ = 1 − 1/ζ²
  const zx2 = wx + sec.mx;
  const zy2 = wy + sec.my;
  const zr2 = zx2 * zx2 + zy2 * zy2;
  const iz2 = 1 / Math.max(1e-9, zr2 * zr2);
  const jx = 1 - (zx2 * zx2 - zy2 * zy2) * iz2;
  const jy = 2 * zx2 * zy2 * iz2;
  const jm = Math.max(1e-6, jx * jx + jy * jy);
  // dW/dz = dW/dζ ÷ dz/dζ = u − iv
  const ux = (dWx * jx + dWy * jy) / jm;
  const uy = (dWy * jx - dWx * jy) / jm;
  const u = ux;
  const v = -uy;
  // Back into the box: turn by −α, then y down.
  flowOut.vx = u * ca + v * sa;
  flowOut.vy = -(-u * sa + v * ca);
  flowOut.speed = Math.hypot(u, v);
  return flowOut;
}

/** A point on the wing's surface for circle angle θ, in the box's px. */
function surfaceAt(f: Field, theta: number, out: { x: number; y: number }) {
  const { sec, ca, sa } = f;
  const wx = sec.mx + sec.a * Math.cos(theta);
  const wy = sec.my + sec.a * Math.sin(theta);
  const r2 = wx * wx + wy * wy;
  const zx = wx + wx / r2 - sec.quarter;
  const zy = wy - wy / r2;
  // Back from the aerofoil's plane: turn by −α, scale, y down.
  const mx = zx * ca + zy * sa;
  const my = -zx * sa + zy * ca;
  out.x = f.px + mx / f.k;
  out.y = f.py - my / f.k;
  return out;
}

type Lines = {
  count: number;
  n: Int32Array;
  x: Float32Array;
  y: Float32Array;
  /** Seconds-per-px-of-free-stream to reach each point: puffs are drawn by it. */
  tau: Float32Array;
  upper: Uint8Array;
};

type Geo = {
  w: number;
  h: number;
  dpr: number;
  top: number;
  bottom: number;
  chordPx: number;
  px: number;
  py: number;
  sec: Section;
};

/**
 * The streamlines for the wing at `alpha`, seeded evenly up the rake at the
 * left and traced across the box with a midpoint step along the flow. Each
 * point carries the time smoke takes to reach it. A step that lands inside the
 * wing is put back on its surface, so the threads hug it instead of piercing it.
 */
function trace(
  g: Geo,
  alpha: number,
  count: number,
  lines: Lines,
  f: Field,
): void {
  const span = g.bottom - g.top;
  const surface = { x: 0, y: 0 };
  lines.count = count;
  const te = surfaceAt(f, -Math.atan2(g.sec.my, 1 - g.sec.mx), { x: 0, y: 0 });
  for (let l = 0; l < count; l += 1) {
    let x = 0;
    let y = g.top + span * ((l + 0.5) / count);
    let t = 0;
    let n = 0;
    const base = l * MAX_PTS;
    while (n < MAX_PTS && x <= g.w + DS) {
      lines.x[base + n] = x;
      lines.y[base + n] = y;
      lines.tau[base + n] = t;
      n += 1;
      let v = flowAt(f, x, y);
      const s1 = Math.max(0.04, v.speed);
      const hx = x + (v.vx / s1) * DS * 0.5;
      const hy = y + (v.vy / s1) * DS * 0.5;
      v = flowAt(f, hx, hy);
      const s2 = Math.max(0.04, v.speed);
      let nx = x + (v.vx / s2) * DS;
      let ny = y + (v.vy / s2) * DS;
      // Near the stagnation point the direction is undefined: nudge the
      // thread off the dividing line so it goes round, not back.
      if (nx < x - DS * 0.4) {
        nx = x + DS * 0.5;
        ny = y + (y < f.py ? -DS : DS);
      }
      const back = flowAt(f, nx, ny);
      if (back.inside) {
        const th = Math.atan2(back.zy, back.zx);
        surfaceAt(f, th, surface);
        const ox = surface.x - f.px;
        const oy = surface.y - f.py;
        const len = Math.hypot(ox, oy) || 1;
        nx = surface.x + (ox / len) * 0.6;
        ny = surface.y + (oy / len) * 0.6;
      }
      t += DS / s2;
      x = nx;
      y = ny;
    }
    lines.n[l] = n;
    // A thread that leaves the trailing edge above it ran over the top.
    let upper = 0;
    for (let i = 0; i < n; i += 1) {
      if (lines.x[base + i]! > te.x + 4) {
        upper = lines.y[base + i]! < te.y ? 1 : 0;
        break;
      }
    }
    lines.upper[l] = upper;
  }
}

type Palette = {
  smoke: string;
  model: string;
  modelBack: string;
  puff: HTMLCanvasElement | null;
};

type Sim = {
  last: number;
  carry: number;
  /** The smoke's clock, s. */
  t: number;
  /** The wing shown, degrees, and how fast it turns. */
  a: number;
  av: number;
  traced: number;
  buffet: number;
};

type Api = {
  rebuild: () => void;
  readColours: () => void;
  draw: () => void;
  kick: () => void;
  tick: (now: number) => void;
};

/** The props a tunnel must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='tab'],[contenteditable='true']";

/** The angle in words, for the slider's reading. */
const describe = (deg: number, stall: number) =>
  `${Math.round(deg)} degrees, ${deg > stall ? "stalled" : "flow attached"}`;

/**
 * A wind tunnel's test section in Canvas 2D: rails with a fine scale, a wing
 * model on a sting, and parallel threads of smoke streaming past it from a
 * rake at the left. The flow is real potential flow — a Joukowski aerofoil
 * with the Kutta circulation, solved in closed form — so the smoke divides at
 * the stagnation point, hugs the upper surface and leaves the trailing edge
 * smoothly. Each thread knows how long smoke takes to reach every point on
 * it, and puffs released together at the rake are drawn by that time, so the
 * puffs over the top race ahead of the ones underneath: lift, made visible.
 * The model is seen a little off-axis — its section is the tip's face and the
 * span recedes behind it — and from the tip a tube of haze peels away, two
 * filaments wound round a soft core with dust spiralling through it, wound
 * tighter the more lift the wing makes.
 *
 * Drag the wing up or down, 1:1 at its leading edge, or use the keys: release
 * projects the throw a little and the model locks onto its angle on the snap
 * spring. Past `stallAngle` the flow over the top lets go: the threads leave
 * the surface and tumble behind it on time-varying curl noise, eddies roll
 * off the separation point, the tip tube unravels and the model buffets. The
 * wing's angle is a real slider. Under reduced motion the threads stand
 * steady, the tube and dust are still, and a stalled wing shows its tumbled
 * smoke frozen at one moment.
 */
export function SmokeTunnel({
  flow = 0.5,
  angle = 6,
  smoke = 0.6,
  value,
  onValueChange,
  minAngle = -10,
  maxAngle = 26,
  stallAngle = 14,
  camber = 0.5,
  thickness = 0.5,
  vortex = 0.6,
  smokeColor = "var(--foreground)",
  modelColor = "var(--ink-2)",
  children,
  interactive = true,
  paused = false,
  label = "Wing angle",
  seed = 8,
  dpr = 2,
  onStallChange,
  disabled = false,
  className,
}: SmokeTunnelProps) {
  const motionSafe = useMotionSafe();
  const lo = Math.min(minAngle, maxAngle - 1);
  const hi = Math.max(maxAngle, lo + 1);
  const [own, setOwn] = React.useState(() => clamp(angle, lo, hi));
  // A new `angle` turns the wing there, as a fresh start would.
  const [seenAngle, setSeenAngle] = React.useState(angle);
  if (seenAngle !== angle) {
    setSeenAngle(angle);
    setOwn(clamp(angle, lo, hi));
  }
  const current = clamp(value ?? own, lo, hi);
  const stall = clamp(stallAngle, lo + 1, hi);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const paintKey = `${smokeColor}|${modelColor}`;
  const k = {
    flow: clamp01(flow),
    smoke: clamp01(smoke),
    target: current,
    lo,
    hi,
    stall,
    camber: clamp01(camber),
    thickness: clamp01(thickness),
    vortex: clamp01(vortex),
    seed,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const geo = React.useRef<Geo | null>(null);
  const pal = React.useRef<Palette | null>(null);
  const field = React.useRef<Field | null>(null);
  const lines = React.useRef<Lines>({
    count: 0,
    n: new Int32Array(MAX_LINES),
    x: new Float32Array(MAX_LINES * MAX_PTS),
    y: new Float32Array(MAX_LINES * MAX_PTS),
    tau: new Float32Array(MAX_LINES * MAX_PTS),
    upper: new Uint8Array(MAX_LINES),
  });
  const outline = React.useRef({
    x: new Float32Array(OUTLINE),
    y: new Float32Array(OUTLINE),
  });
  /** The upper surface from the trailing edge forward to the nose, for the stall. */
  const top = React.useRef({
    x: new Float32Array(UPPER),
    y: new Float32Array(UPPER),
    theta: new Float32Array(UPPER),
  });
  const dust = React.useMemo(() => {
    const rand = lcg(seed);
    const u = new Float32Array(DUST);
    const ph = new Float32Array(DUST);
    const rr = new Float32Array(DUST);
    for (let i = 0; i < DUST; i += 1) {
      u[i] = rand();
      ph[i] = rand() * TAU;
      rr[i] = 0.35 + 0.65 * rand();
    }
    return { u, ph, rr };
  }, [seed]);
  const noise = React.useMemo(() => noiseOf(seed), [seed]);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    t: 0,
    a: current,
    av: 0,
    traced: Number.NaN,
    buffet: 0,
  });
  const stalledRef = React.useRef(current > stall);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onValueChange, onStallChange });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const rgbOf = (colour: string): readonly [number, number, number] => {
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return [128, 128, 128];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    const colourOf = (i: number) => {
      const span = carriers.children[i];
      return span ? getComputedStyle(span).color : "rgb(128, 128, 128)";
    };
    const s = rgbOf(colourOf(0));
    const m = rgbOf(colourOf(1));
    const puff = document.createElement("canvas");
    puff.width = 32;
    puff.height = 32;
    const ctx = puff.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, `rgb(${s[0]} ${s[1]} ${s[2]} / 0.85)`);
      g.addColorStop(0.45, `rgb(${s[0]} ${s[1]} ${s[2]} / 0.3)`);
      g.addColorStop(1, `rgb(${s[0]} ${s[1]} ${s[2]} / 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 32, 32);
    }
    pal.current = {
      smoke: `rgb(${s[0]} ${s[1]} ${s[2]})`,
      model: `rgb(${m[0]} ${m[1]} ${m[2]})`,
      modelBack: `rgb(${Math.round(m[0] * 0.62)} ${Math.round(m[1] * 0.62)} ${Math.round(m[2] * 0.66)})`,
      puff,
    };
  };

  /** The threads and the outline for the angle shown, traced afresh. */
  const retrace = () => {
    const g = geo.current;
    if (!g) return;
    const s = sim.current;
    const f = fieldOf(g.sec, g.px, g.py, g.chordPx, s.a * DEG);
    field.current = f;
    const span = g.bottom - g.top;
    const count = clamp(
      Math.round((10 + 24 * k.smoke) * Math.min(1, span / 180)),
      6,
      MAX_LINES,
    );
    trace(g, s.a * DEG, count, lines.current, f);
    const o = outline.current;
    const pt = { x: 0, y: 0 };
    for (let i = 0; i < OUTLINE; i += 1) {
      surfaceAt(f, (i / OUTLINE) * TAU, pt);
      o.x[i] = pt.x;
      o.y[i] = pt.y;
    }
    const u = top.current;
    const from = -Math.atan2(g.sec.my, 1 - g.sec.mx);
    for (let j = 0; j < UPPER; j += 1) {
      const th = from + ((Math.PI - from) * j) / (UPPER - 1);
      surfaceAt(f, th, pt);
      u.x[j] = pt.x;
      u.y[j] = pt.y;
      u.theta[j] = th;
    }
    s.traced = s.a;
  };

  /** The upper surface's height at x, and level with the trailing edge behind it. */
  const surfaceTop = (x: number) => {
    const u = top.current;
    if (x >= u.x[0]!) return u.y[0]!;
    for (let j = 0; j < UPPER - 1; j += 1) {
      const x0 = u.x[j]!;
      const x1 = u.x[j + 1]!;
      if (x <= x0 && x >= x1) {
        const t = x0 - x1 > 1e-6 ? (x0 - x) / (x0 - x1) : 0;
        return u.y[j]! + (u.y[j + 1]! - u.y[j]!) * t;
      }
    }
    return u.y[UPPER - 1]!;
  };

  const rebuild = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 8 || h < 8) return;
    const scale = Math.min(window.devicePixelRatio || 1, k.dpr);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const top = 12;
    const bottom = h - 12;
    const chordPx = Math.min(w * 0.42, (bottom - top) * 1.25);
    geo.current = {
      w,
      h,
      dpr: scale,
      top,
      bottom,
      chordPx,
      px: w * 0.36,
      py: (top + bottom) / 2,
      sec: sectionOf(k.camber, k.thickness),
    };
    if (!pal.current) readColours();
    retrace();
    draw();
    kick();
  };

  /** How deep into the stall the wing shown is, 0 to 1. */
  const stallDepth = () => smooth(k.stall, k.stall + 6, sim.current.a);

  /** The frame's stall, read by `displace` without a closure per frame. */
  const stirring = React.useRef({
    depth: 0,
    sepX: 0,
    reach: 0,
    time: 0,
    flowT: 0,
    x: 0,
    y: 0,
  });

  /**
   * Where point i of thread l is drawn this frame: as traced, or — over the
   * top of a stalled wing — lifted off the surface and stirred by curl noise
   * that grows downstream of the separation.
   */
  const displace = (l: number, i: number) => {
    const L = lines.current;
    const st = stirring.current;
    const g = geo.current;
    const b = l * MAX_PTS + i;
    let x = L.x[b]!;
    let y = L.y[b]!;
    if (g && st.depth > 0 && L.upper[l] && x > st.sepX) {
      const along = x - st.sepX;
      const lifted = Math.min(st.reach, along * Math.tan(16 * DEG)) * st.depth;
      const above = surfaceTop(x) - y;
      if (above < st.reach) y -= lifted * (1 - clamp01(above / st.reach));
      const amp =
        st.depth *
        Math.min(1, along / (g.chordPx * 0.5)) *
        (6 + Math.min(20, along * 0.06));
      const nx = x * 0.018 - st.flowT * 0.012;
      const ny = y * 0.03 + st.time * 0.4;
      const e = 0.6;
      const dx = (noise(nx, ny + e) - noise(nx, ny - e)) / (2 * e);
      const dy = -(noise(nx + e, ny) - noise(nx - e, ny)) / (2 * e);
      x += dx * amp * 2.2;
      y += dy * amp * 2.2;
    }
    st.x = x;
    st.y = y;
    return st;
  };

  const draw = () => {
    const g = geo.current;
    const p = pal.current;
    const f = field.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!g || !p || !f || !canvas || !ctx) return;
    const s = sim.current;
    const L = lines.current;
    const o = outline.current;
    const depth = stallDepth();
    const live = k.motionSafe;
    const time = live ? s.t : 1.7;
    const speed = 60 + 180 * k.flow;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // The test section: rails and their scale, and the rake's nozzles.
    ctx.strokeStyle = p.smoke;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, g.top - 3.5);
    ctx.lineTo(g.w, g.top - 3.5);
    ctx.moveTo(0, g.bottom + 3.5);
    ctx.lineTo(g.w, g.bottom + 3.5);
    for (let x = 12; x < g.w; x += 24) {
      const major = Math.round(x / 24) % 5 === 0;
      ctx.moveTo(x, g.top - 3.5);
      ctx.lineTo(x, g.top - (major ? 9 : 6.5));
      ctx.moveTo(x, g.bottom + 3.5);
      ctx.lineTo(x, g.bottom + (major ? 9 : 6.5));
    }
    ctx.stroke();

    // The separation point on the upper surface, moving forward as the
    // stall deepens, and the trailing edge.
    const te = { x: 0, y: 0 };
    surfaceAt(f, -Math.atan2(g.sec.my, 1 - g.sec.mx), te);
    // Where the flow lets go: from the trailing edge, forward along the upper
    // surface toward the nose as the stall deepens.
    const up = top.current;
    const sepAt = Math.min(UPPER - 1, Math.round(depth * 0.72 * (UPPER - 1)));
    const sepX = up.x[sepAt]!;
    const sepY = up.y[sepAt]!;
    const lift = Math.sin(s.a * DEG + Math.atan2(g.sec.my, 1 - g.sec.mx));
    const cl = Math.max(0, lift) * (1 - 0.65 * depth);
    const flowT = time * speed;

    // The smoke stays between the tunnel's walls.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, g.top - 2, g.w, g.bottom - g.top + 4);
    ctx.clip();

    // The threads: steady lines, lifted off the top and stirred where the
    // flow has let go.
    const reach = g.chordPx * 0.4;
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.16 + 0.34 * k.smoke;
    ctx.strokeStyle = p.smoke;
    ctx.beginPath();
    const stir = stirring.current;
    stir.depth = depth;
    stir.sepX = sepX;
    stir.reach = reach;
    stir.time = time;
    stir.flowT = flowT;
    const displaced = displace;
    for (let l = 0; l < L.count; l += 1) {
      const n = L.n[l]!;
      for (let i = 0; i < n; i += 1) {
        const q = displaced(l, i);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
    }
    ctx.stroke();

    // Puffs, released together at the rake and drawn by the time smoke takes
    // to reach each point: over the top they run ahead.
    if (p.puff) {
      const period = 0.55;
      const size = 7 + 5 * k.smoke;
      for (let l = 0; l < L.count; l += 1) {
        const n = L.n[l]!;
        const b = l * MAX_PTS;
        const slow = depth > 0 && L.upper[l] ? 1 + 1.6 * depth : 1;
        let i = 0;
        let tauSep = -1;
        const total = L.tau[b + n - 1]! / speed;
        const newest = live ? Math.floor(time / period) : 0;
        for (let pk = 0; pk < 40; pk += 1) {
          const born = (newest - pk) * period;
          const age = live ? time - born : pk * period + 0.27;
          if (age < 0) continue;
          if (age > total * slow + period) break;
          // The point this puff has reached: the time to reach it is its
          // tau over the tunnel's speed, and past the separation of a stalled
          // wing the dead air holds the smoke back.
          while (i < n - 1) {
            let reach = L.tau[b + i + 1]!;
            if (slow > 1 && L.x[b + i + 1]! > sepX) {
              if (tauSep < 0) tauSep = L.tau[b + i]!;
              reach = tauSep + (reach - tauSep) * slow;
            }
            if (reach / speed >= age) break;
            i += 1;
          }
          if (i >= n - 1) break;
          const q = displaced(l, i);
          const ax = q.x;
          const ay = q.y;
          const nq = displaced(l, Math.min(n - 1, i + 1));
          const dx = nq.x - ax;
          const dy = nq.y - ay;
          const len = Math.hypot(dx, dy) || 1;
          // Faster smoke draws a longer puff.
          const dtau = L.tau[b + i + 1]! - L.tau[b + i]! || DS;
          const stretch = clamp(DS / dtau, 0.6, 2.4);
          const ux = dx / len;
          const uy = dy / len;
          ctx.globalAlpha =
            (0.22 + 0.5 * k.smoke) *
            (L.x[b + i]! > sepX && L.upper[l] ? 1 - 0.5 * depth : 1);
          ctx.setTransform(
            g.dpr * ux * stretch,
            g.dpr * uy * stretch,
            -g.dpr * uy,
            g.dpr * ux,
            g.dpr * ax,
            g.dpr * ay,
          );
          ctx.drawImage(p.puff, -size / 2, -size / 2, size, size);
        }
      }
      ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    }

    // Eddies rolling off the separation point as the flow lets go.
    if (depth > 0.05) {
      ctx.strokeStyle = p.smoke;
      ctx.lineWidth = 1;
      for (let e = 0; e < EDDIES; e += 1) {
        const life = 1.6;
        const born = live ? Math.floor(time / 0.45) - e : -e;
        const age = (live ? time - born * 0.45 : e * 0.45 + 0.2) % (life * 2);
        if (age > life) continue;
        const ex = sepX + age * speed * 0.55;
        if (ex > g.w + 20) continue;
        const ey =
          sepY - 5 - age * (10 + 12 * depth) + Math.sin(born * 1.7) * 4;
        const rad = 4 + age * 14 * depth;
        const spin = age * 7 + born;
        ctx.globalAlpha =
          depth * (0.5 - 0.3 * (age / life)) * (0.4 + 0.6 * k.smoke);
        ctx.beginPath();
        for (let j = 0; j <= 28; j += 1) {
          const th = spin + (j / 28) * TAU * 1.6;
          const rr = rad * (0.25 + (0.75 * j) / 28);
          const x = ex + Math.cos(th) * rr;
          const y = ey + Math.sin(th) * rr * 0.8;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // The tip's tube of haze: a soft core, two filaments wound round it and
    // dust spiralling through. Its twist follows the lift.
    if (k.vortex > 0) {
      const x0 = te.x;
      const tubeLen = g.w - x0;
      const yc = (x: number) => te.y + 6 + (x - x0) * (0.03 + 0.08 * cl);
      const rad = (x: number) => 4 + (x - x0) * 0.035 + g.chordPx * 0.02;
      const twist = (0.05 + 0.1 * cl) * (1 - 0.6 * depth);
      const spin = live ? time * (2 + 6 * cl) * (0.4 + k.flow) : 0;
      const strength =
        k.vortex * (0.35 + 0.65 * Math.min(1, cl * 3)) * (1 - 0.55 * depth);
      ctx.strokeStyle = p.smoke;
      ctx.globalAlpha = 0.05 * strength;
      ctx.lineWidth = 2 * rad(x0 + tubeLen * 0.6);
      ctx.beginPath();
      ctx.moveTo(x0, yc(x0));
      ctx.lineTo(g.w, yc(g.w));
      ctx.stroke();
      for (let strand = 0; strand < 2; strand += 1) {
        for (let face = 0; face < 2; face += 1) {
          ctx.globalAlpha = strength * (face ? 0.55 : 0.18);
          ctx.lineWidth = face ? 1.1 : 0.8;
          ctx.beginPath();
          let pen = false;
          for (let x = x0; x <= g.w; x += 3) {
            const ph = strand * Math.PI + (x - x0) * twist - spin;
            const front = Math.sin(ph) >= 0;
            const ragged =
              depth > 0
                ? depth * 4 * (noise(x * 0.05, time * 0.6 + strand) - 0.5)
                : 0;
            const y = yc(x) + Math.cos(ph) * rad(x) + ragged;
            if (front === (face === 1)) {
              if (!pen) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
              pen = true;
            } else pen = false;
          }
          ctx.stroke();
        }
      }
      ctx.fillStyle = p.smoke;
      for (let i = 0; i < DUST; i += 1) {
        const u =
          (dust.u[i]! + (live ? (time * speed * 0.85) / tubeLen : 0)) % 1;
        const x = x0 + u * tubeLen;
        const ph = dust.ph[i]! + (x - x0) * twist - spin;
        const y = yc(x) + Math.cos(ph) * rad(x) * dust.rr[i]!;
        const near = 0.5 + 0.5 * Math.sin(ph);
        ctx.globalAlpha = strength * (0.25 + 0.6 * near) * Math.min(1, u * 8);
        const r = 0.6 + 0.9 * near;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
    }

    ctx.restore();

    // The model: the span receding up and to the right behind the tip's
    // face, on its sting.
    const ex = g.chordPx * 0.05;
    const ey = -g.chordPx * 0.035;
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.modelBack;
    ctx.strokeStyle = p.modelBack;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.px, g.py);
    ctx.lineTo(g.px + ex * 0.5, g.bottom + 3.5);
    ctx.stroke();
    for (let step = 6; step >= 1; step -= 1) {
      const sx = (ex * step) / 6;
      const sy = (ey * step) / 6;
      ctx.beginPath();
      for (let i = 0; i < OUTLINE; i += 1) {
        const x = o.x[i]! + sx;
        const y = o.y[i]! + sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = p.model;
    ctx.beginPath();
    for (let i = 0; i < OUTLINE; i += 1) {
      if (i === 0) ctx.moveTo(o.x[i]!, o.y[i]!);
      else ctx.lineTo(o.x[i]!, o.y[i]!);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = p.smoke;
    ctx.lineWidth = 1;
    ctx.stroke();

    // The angle: a short level line from the pivot and the arc to the chord.
    const a = s.a * DEG;
    const arm = g.chordPx * 0.3;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(g.px - arm, g.py);
    ctx.lineTo(g.px - arm * 0.35, g.py);
    ctx.moveTo(g.px - arm * 0.8, g.py);
    ctx.arc(g.px, g.py, arm * 0.8, Math.PI, Math.PI + a, a < 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Steps the smoke's clock and the wing's spring; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    let busy = false;
    if (!k.motionSafe) {
      if (!dragging.current) {
        s.a = k.target;
        s.av = 0;
      }
      return false;
    }
    if (!k.paused) {
      s.t += dt * (0.5 + k.flow);
      busy = true;
    }
    if (!dragging.current) {
      // The model locks onto its angle on the snap spring.
      const sp = springs.snap;
      s.carry += dt;
      let steps = 0;
      while (s.carry >= STEP && steps < 8) {
        s.carry -= STEP;
        steps += 1;
        s.av +=
          ((-sp.stiffness * (s.a - k.target) - sp.damping * s.av) / sp.mass) *
          STEP;
        s.a += s.av * STEP;
      }
      if (steps === 8) s.carry = 0;
      if (Math.abs(s.a - k.target) > 0.01 || Math.abs(s.av) > 0.05) busy = true;
      else {
        s.a = k.target;
        s.av = 0;
      }
    }
    // A stalled wing buffets: a small, quick, uneven shudder.
    const depth = stallDepth();
    s.buffet =
      depth > 0 && !k.paused
        ? depth *
          0.45 *
          (Math.sin(s.t * 71) * 0.6 + Math.sin(s.t * 43 + 1.3) * 0.4)
        : 0;
    return busy;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden || !geo.current) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = advance(dt);
    const shownAngle = s.a + s.buffet;
    if (Math.abs(shownAngle - s.traced) > 0.02) {
      const keep = s.a;
      s.a = shownAngle;
      retrace();
      s.a = keep;
    }
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { rebuild, readColours, draw, kick, tick };
    report.current = { onValueChange, onStallChange };
  });

  React.useEffect(() => {
    api.current?.rebuild();
  }, [k.camber, k.thickness, k.smoke, k.dpr]);

  React.useEffect(() => {
    if (!geo.current) return;
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    // Reduced motion and a host's new angle: the wing goes straight there.
    if (!motionSafe) {
      sim.current.a = k.target;
      sim.current.av = 0;
    }
    api.current?.draw();
    api.current?.kick();
  }, [k.target, k.flow, k.vortex, k.stall, noise, paused, motionSafe]);

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

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.rebuild());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
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

  /** A new angle from the visitor: held here unless the host holds it. */
  const commit = (next: number) => {
    const v = Math.round(clamp(next, lo, hi) * 2) / 2;
    const was = stalledRef.current;
    const now = v > stall;
    if (now !== was) {
      stalledRef.current = now;
      report.current.onStallChange?.(now);
      setSaid((x) => ({
        n: x.n + 1,
        text: now ? "Stalled." : "Flow attached again.",
      }));
    }
    if (v === current) return;
    if (value === undefined) setOwn(v);
    report.current.onValueChange?.(v);
  };

  /** Degrees per px of vertical drag: the leading edge follows the finger. */
  const perPx = () => {
    const g = geo.current;
    return g ? 1 / (g.chordPx * 0.6 * DEG) : 0.3;
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled: !k.enabled,
    onStart: () => {
      dragging.current = true;
      dragFrom.current = sim.current.a;
      sim.current.av = 0;
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current - offset.y * perPx();
      const span = hi - lo;
      const a =
        raw < lo
          ? lo + rubberband(raw - lo, span)
          : raw > hi
            ? hi + rubberband(raw - hi, span)
            : raw;
      sim.current.a = a;
      commit(a);
      if (!k.motionSafe) api.current?.tick(performance.now());
      kick();
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const s = sim.current;
      // The throw carries the wing a little further; the snap spring takes
      // the release velocity and locks it on.
      const thrown = project(s.a, -velocity.y * perPx(), 0.99);
      s.av = clamp(-velocity.y * perPx(), -400, 400);
      commit(thrown);
      kick();
    },
    onCancel: () => {
      dragging.current = false;
      kick();
    },
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!k.enabled) return;
    const steps: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 5,
      PageDown: -5,
    };
    const by = steps[event.key];
    if (by !== undefined) {
      event.preventDefault();
      commit(current + by);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? lo : hi);
    }
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
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/smoke-tunnel relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-pan-x" : "touch-auto",
        className,
      )}
    >
      <TunnelStill
        angle={current}
        camber={k.camber}
        thickness={k.thickness}
        smoke={k.smoke}
        smokeColor={smokeColor}
        modelColor={modelColor}
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
        {[smokeColor, modelColor].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={k.enabled ? 0 : -1}
        aria-label={label}
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={describe(current, stall)}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-ns-resize" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

const STILL_W = 720;
const STILL_H = 208;

/**
 * The designed still for the server render and the first paint: the rails,
 * the model at its starting angle and its threads, traced with the same
 * closed-form flow at the card's size and rounded to a tenth of a px.
 */
function TunnelStill({
  angle,
  camber,
  thickness,
  smoke,
  smokeColor,
  modelColor,
}: {
  angle: number;
  camber: number;
  thickness: number;
  smoke: number;
  smokeColor: string;
  modelColor: string;
}) {
  const art = React.useMemo(() => {
    const top = 12;
    const bottom = STILL_H - 12;
    const chordPx = Math.min(STILL_W * 0.42, (bottom - top) * 1.25);
    const g: Geo = {
      w: STILL_W,
      h: STILL_H,
      dpr: 1,
      top,
      bottom,
      chordPx,
      px: STILL_W * 0.36,
      py: (top + bottom) / 2,
      sec: sectionOf(camber, thickness),
    };
    const f = fieldOf(g.sec, g.px, g.py, chordPx, angle * DEG);
    const count = Math.round(10 + 24 * smoke);
    const L: Lines = {
      count: 0,
      n: new Int32Array(MAX_LINES),
      x: new Float32Array(MAX_LINES * MAX_PTS),
      y: new Float32Array(MAX_LINES * MAX_PTS),
      tau: new Float32Array(MAX_LINES * MAX_PTS),
      upper: new Uint8Array(MAX_LINES),
    };
    trace(g, angle * DEG, Math.min(MAX_LINES, count), L, f);
    let threads = "";
    for (let l = 0; l < L.count; l += 1) {
      const n = L.n[l]!;
      for (let i = 0; i < n; i += i < n - 4 ? 4 : 1) {
        const b = l * MAX_PTS + i;
        threads += `${i === 0 ? "M" : "L"}${r1(L.x[b]!)} ${r1(L.y[b]!)}`;
      }
    }
    let wing = "";
    const pt = { x: 0, y: 0 };
    for (let i = 0; i < OUTLINE; i += 2) {
      surfaceAt(f, (i / OUTLINE) * TAU, pt);
      wing += `${i === 0 ? "M" : "L"}${r1(pt.x)} ${r1(pt.y)}`;
    }
    return { threads, wing: `${wing}Z`, top, bottom };
  }, [angle, camber, thickness, smoke]);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${STILL_W} ${STILL_H}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/smoke-tunnel:opacity-0"
    >
      <g style={{ color: smokeColor }} fill="none" stroke="currentColor">
        <path
          d={`M0 ${art.top - 3.5}H${STILL_W}M0 ${art.bottom + 3.5}H${STILL_W}`}
          strokeOpacity={0.28}
        />
        {/* A nested viewport clips the threads to the tunnel's walls. */}
        <svg
          x={0}
          y={art.top - 2}
          width={STILL_W}
          height={art.bottom - art.top + 4}
          viewBox={`0 ${art.top - 2} ${STILL_W} ${art.bottom - art.top + 4}`}
        >
          <path d={art.threads} strokeOpacity={0.4} strokeWidth={0.9} />
        </svg>
      </g>
      <path d={art.wing} style={{ fill: modelColor }} />
    </svg>
  );
}
