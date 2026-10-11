"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CycloneJarGlass = "clear" | "sea" | "amber" | "smoke";
export type CycloneJarState = "still" | "swirling" | "settling";

export type CycloneJarProps = {
  /** How much a circle of the hand spins the water and how deep the funnel can reach, 0 to 1. @default 0.6 */
  swirl?: number;
  /** How many glitter flakes, 100 to 1500. @default 700 */
  particles?: number;
  /** The glass's tint. @default "clear" */
  glass?: CycloneJarGlass;
  /** The glitter, CSS colours. @default gold, silver, blue and rose pigments from the tokens */
  colors?: string[];
  /** The water, any CSS colour (translucent reads best). @default a pale (light) or deep (dark) blue, tinted by the glass */
  waterColor?: string;
  /** How full the jar is, 0.6 to 0.95. @default 0.86 */
  fill?: number;
  /** How quickly the spin dies away, 0 (a long, slow spin-down) to 1 (thick water, quick). @default 0.4 */
  viscosity?: number;
  /** How quickly the glitter settles, 0 to 1. @default 0.5 */
  sink?: number;
  /** How brightly flakes flash as they turn to the light, 0 to 1. @default 0.7 */
  glint?: number;
  /** Fires when the water starts swirling, starts settling, or comes to rest. */
  onStateChange?: (state: CycloneJarState) => void;
  /** A swish for every half turn of the hand, and for each key press. @default false */
  sound?: boolean;
  /** Freeze the water and the glitter where they are. @default false */
  paused?: boolean;
  /** Seeds where every flake starts and how it tumbles. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The jar's accessible name. @default "Glitter jar" */
  label?: string;
  /** No swirling. @default false */
  disabled?: boolean;
  /** Sizes the piece; the jar keeps its shape and centres in it. */
  className?: string;
};

/* The jar is drawn in a 200 × 460 box, scaled to fit. */
const VB_W = 200;
const VB_H = 460;
const CX = 100;
const R = 85;
const FLOOR = 436;
const BODY_TOP = 104;
const TILT = 0.12;
const TAU = Math.PI * 2;
const STEP = 1 / 120;

const GLASS: Record<CycloneJarGlass, { tint: string; edge: string }> = {
  clear: {
    tint: "oklch(from var(--accent) 0.9 0.015 h)",
    edge: "color-mix(in oklab, var(--ink) 34%, transparent)",
  },
  sea: {
    tint: "oklch(from var(--signal) 0.8 0.07 h)",
    edge: "oklch(from var(--signal) 0.6 0.09 h / 0.7)",
  },
  amber: {
    tint: "oklch(from var(--warn) 0.78 0.11 h)",
    edge: "oklch(from var(--warn) 0.58 0.12 h / 0.75)",
  },
  smoke: {
    tint: "oklch(from var(--accent) 0.42 0.02 h)",
    edge: "oklch(from var(--accent) 0.32 0.02 h / 0.8)",
  },
};

const DEFAULT_COLORS = [
  "oklch(from var(--warn) 0.84 0.14 h)",
  "oklch(from var(--accent) 0.93 0.02 h)",
  "oklch(from var(--accent-bright) 0.68 0.16 h)",
  "oklch(from var(--danger) 0.72 0.14 h)",
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const wrap = (a: number) => a - TAU * Math.round(a / TAU);

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Any CSS colour as 0–255 sRGB and 0–1 alpha, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number, number] => {
    if (!ctx) return [200, 200, 200, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(200, 200, 200)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 255) / 255];
  };
}

/** The water's top at rest, in box units, for a fill share. */
const restSurface = (fill: number) =>
  r2(FLOOR - clamp(fill, 0.6, 0.95) * (FLOOR - BODY_TOP));

/** The jar's inside: walls, a rounded floor, up to the shoulder. */
function interiorPath(top: number) {
  const left = CX - R;
  const right = CX + R;
  const corner = 24;
  return `M ${left} ${top} L ${left} ${FLOOR - corner} Q ${left} ${FLOOR} ${left + corner} ${FLOOR} L ${right - corner} ${FLOOR} Q ${right} ${FLOOR} ${right} ${FLOOR - corner} L ${right} ${top} Z`;
}

const OUTER =
  "M 30 62 L 170 62 C 172 82 192 84 192 104 L 192 422 Q 192 452 162 452 L 38 452 Q 8 452 8 422 L 8 104 C 8 84 28 82 30 62 Z";
const INNER =
  "M 36 66 L 164 66 C 166 84 185 88 185 108 L 185 412 Q 185 436 161 436 L 39 436 Q 15 436 15 412 L 15 108 C 15 88 34 84 36 66 Z";

type Pose = {
  r: Float32Array;
  a: Float32Array;
  y: Float32Array;
};

type Config = {
  swirl: number;
  particles: number;
  colorKey: string;
  colors: string[];
  waterColor: string;
  fill: number;
  viscosity: number;
  sink: number;
  glint: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** Adds spin, in radians of the hand's travel around the jar's axis (signed). */
  stir: (radians: number) => void;
  /** A push from a key: a share of the full spin, signed. */
  push: (share: number) => void;
  spin: () => number;
  dispose: () => void;
};

function createEngine(
  box: HTMLDivElement,
  canvas: HTMLCanvasElement,
  probe: HTMLElement,
  visible: { current: boolean },
  report: (state: CycloneJarState) => void,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let scale = 1;
  let k = 1;
  const read = rgbReader();
  // Water: spin (rad/s at mid-radius), funnel depth (share of the water) and its speed.
  let omega = 0;
  let depth = 0;
  let depthV = 0;
  let lastInput = -10;
  let state: CycloneJarState = "settling";
  // Flakes: radius, angle, height, tumble, tumble rate, size, colour, at rest.
  let n = 0;
  let pr = new Float32Array(0);
  let pa = new Float32Array(0);
  let py = new Float32Array(0);
  let pt = new Float32Array(0);
  let pw = new Float32Array(0);
  let ps = new Float32Array(0);
  let pc = new Uint8Array(0);
  let rest = new Uint8Array(0);
  let heap = new Float32Array(0);
  // The glitter's colours: per colour, 16 levels of light, as ready-made strings.
  let tones: string[][] = [];
  let sparkle = "rgb(255, 255, 255)";
  let waterTop = "rgba(0, 0, 0, 0)";
  let waterBottom = "rgba(0, 0, 0, 0)";
  let waterGrad: CanvasGradient | null = null;
  let highlight = "rgba(255, 255, 255, 0.5)";
  // Reduced motion: two stills, cross-faded.
  let stillA: HTMLCanvasElement | null = null;
  let stillB: HTMLCanvasElement | null = null;
  let mix = 0;
  let mixTarget = 0;
  let holdUntil = 0;

  const surfaceY = () => restSurface(cfg?.fill ?? 0.86);
  const omegaMax = () => lerp(5, 11, clamp(cfg?.swirl ?? 0.6, 0, 1));

  const seedFlakes = (c: Config, suspended: boolean) => {
    n = Math.round(clamp(c.particles, 100, 1500));
    pr = new Float32Array(n);
    pa = new Float32Array(n);
    py = new Float32Array(n);
    pt = new Float32Array(n);
    pw = new Float32Array(n);
    ps = new Float32Array(n);
    pc = new Uint8Array(n);
    rest = new Uint8Array(n);
    heap = new Float32Array(n);
    const top = surfaceY();
    const colours = Math.max(1, Math.min(8, c.colors.length));
    const mound = 5 + n / 120;
    for (let i = 0; i < n; i += 1) {
      const s = Math.round(c.seed);
      const rn = Math.sqrt(hash(s, i, 1));
      pr[i] = rn * (R - 3);
      pa[i] = hash(s, i, 2) * TAU;
      pt[i] = hash(s, i, 3) * TAU;
      pw[i] = (hash(s, i, 4) - 0.5) * 6;
      ps[i] = 1.1 + hash(s, i, 5) * 1.3;
      pc[i] = Math.floor(hash(s, i, 6) * colours);
      // Where it lies when it lands: higher in the middle, the tea-leaf mound.
      heap[i] = 1.2 + hash(s, i, 7) * mound * Math.max(0, 1 - rn * rn * 1.15);
      if (suspended) {
        py[i] = lerp(top + 6, FLOOR - 4, Math.pow(hash(s, i, 8), 0.7));
        rest[i] = 0;
      } else {
        py[i] = FLOOR - (heap[i] ?? 1);
        rest[i] = 1;
      }
    }
  };

  const funnelAt = (yy: number) => {
    // Half-width of the funnel at height yy, or -1 below its tip.
    const top = surfaceY();
    const reach = depth * (FLOOR - top - 10);
    if (reach < 1) return -1;
    const u = (yy - top) / reach;
    if (u < 0 || u > 1) return -1;
    const s = Math.abs(omega) / omegaMax();
    const mouth = R * lerp(0.48, 0.24, clamp(s, 0, 1));
    return mouth * Math.pow(1 - u, 1.7) + 1.2;
  };

  /** One step of the water and every flake. */
  const step = (h: number) => {
    const c = cfg;
    if (!c) return;
    clock += h;
    const tau = lerp(5, 1.4, clamp(c.viscosity, 0, 1));
    omega *= Math.exp(-h / tau);
    if (Math.abs(omega) < 0.02) omega = 0;
    const max = omegaMax();
    const s = clamp(Math.abs(omega) / max, 0, 1);
    // The funnel follows the spin squared, lagging on the drift spring.
    const goal = Math.pow(s, 1.4) * lerp(0.45, 0.9, clamp(c.swirl, 0, 1));
    const kk = springs.drift.stiffness / springs.drift.mass;
    const cc = springs.drift.damping / springs.drift.mass;
    depthV += (-kk * (depth - goal) - cc * depthV) * h;
    depth = Math.max(0, depth + depthV * h);
    const top = surfaceY();
    const span = FLOOR - top;
    const coreR = R * lerp(0.42, 0.2, s);
    const vc = omega * R * 0.5;
    const sinkV = lerp(12, 48, clamp(c.sink, 0, 1));
    for (let i = 0; i < n; i += 1) {
      let r = pr[i] ?? 0;
      let y = py[i] ?? FLOOR;
      if (rest[i]) {
        // A strong spin lifts the glitter back off the floor, the middle last.
        if (s > 0.3 && hash(i, Math.floor(clock * 8), 9) < (s - 0.3) * h * 9) {
          rest[i] = 0;
          y -= 2;
        } else {
          continue;
        }
      }
      const rn = r / R;
      const yn = (y - top) / span;
      // Rankine vortex: solid in the core, 1/r outside it.
      const vt = r < coreR ? (vc * r) / coreR : (vc * coreR) / Math.max(1, r);
      pa[i] = (pa[i] ?? 0) + (vt / Math.max(coreR * 0.5, r)) * h;
      // The secondary flow, one closed cell from a stream function so nothing
      // piles up: in along the floor, up the core, out under the surface,
      // down the walls.
      const cr = Math.cos(Math.PI * rn);
      const sr = Math.sin(Math.PI * rn);
      const cy = Math.cos(Math.PI * yn);
      const sy = Math.sin(Math.PI * yn);
      let vr = s * 18 * sr * cy;
      let vy = -s * 18 * (span / R) * cr * sy + sinkV * (1 - 0.92 * s);
      // Flutter: each flake rocks a little as it falls.
      const ph = (pt[i] ?? 0) * 1.7 + clock * (2 + (ps[i] ?? 1));
      vr += Math.sin(ph) * 3;
      vy += Math.cos(ph * 0.7) * 2;
      r = clamp(r + vr * h, 0, R - 2.5);
      y += vy * h;
      const fw = funnelAt(y);
      if (fw > 0 && r < fw + 2) r = fw + 2;
      if (y < top + 3) y = top + 3;
      const floorAt = FLOOR - (heap[i] ?? 1.5);
      if (y >= floorAt) {
        y = floorAt;
        if (s < 0.08) rest[i] = 1;
      }
      pr[i] = r;
      py[i] = y;
      pt[i] = (pt[i] ?? 0) + (pw[i] ?? 0) * h * (0.35 + 2.2 * s);
    }
  };

  /** A flake's light, 0 (shade) to 1 (its full colour) and on to 1.45 (a glint), as a tone index. */
  const level = (lit: number) =>
    clamp(Math.round(lit < 1 ? lit * 11 : 11 + (lit - 1) * 9), 0, 15);

  /** Draws water, funnel and glitter; `pose` draws a still instead of the live flakes. */
  const paint = (
    target: CanvasRenderingContext2D,
    funnel: number,
    spinShare: number,
    pose: Pose | null,
  ) => {
    const top = surfaceY();
    const reach = funnel * (FLOOR - top - 10);
    const mouth = R * lerp(0.48, 0.24, spinShare);
    const rise = 9 * spinShare * spinShare;
    target.save();
    target.beginPath();
    // Water: its top climbs the walls as it spins.
    target.moveTo(CX - R, top - rise * 0.66);
    for (let x = -R; x <= R; x += 5) {
      const u = x / R;
      target.lineTo(CX + x, top + rise * (0.34 - u * u));
    }
    target.lineTo(CX + R, FLOOR - 24);
    target.quadraticCurveTo(CX + R, FLOOR, CX + R - 24, FLOOR);
    target.lineTo(CX - R + 24, FLOOR);
    target.quadraticCurveTo(CX - R, FLOOR, CX - R, FLOOR - 24);
    target.closePath();
    target.fillStyle = waterGrad ?? waterTop;
    target.fill();
    target.clip();
    // The funnel: a hole of air down the middle, its tip wandering a little.
    if (reach > 2) {
      target.globalCompositeOperation = "destination-out";
      target.beginPath();
      const sway = Math.sin(clock * 1.7) * mouth * 0.18 * spinShare;
      for (let j = 0; j <= 24; j += 1) {
        const u = j / 24;
        const w = mouth * Math.pow(1 - u, 1.7) + 1.2;
        const x = CX + sway * u - w;
        const yy = top - 2 + u * reach;
        if (j === 0) target.moveTo(x, yy);
        else target.lineTo(x, yy);
      }
      for (let j = 24; j >= 0; j -= 1) {
        const u = j / 24;
        const w = mouth * Math.pow(1 - u, 1.7) + 1.2;
        target.lineTo(CX + sway * u + w, top - 2 + u * reach);
      }
      target.closePath();
      target.fill();
      target.globalCompositeOperation = "source-over";
      target.strokeStyle = highlight;
      target.lineWidth = 0.9;
      target.globalAlpha = 0.5 + 0.4 * spinShare;
      target.stroke();
      target.globalAlpha = 1;
    }
    // Glitter: behind the axis first, then in front of it.
    const glintGain = clamp(cfg?.glint ?? 0.7, 0, 1);
    const R0 = pose ? pose.r : pr;
    const A0 = pose ? pose.a : pa;
    const Y0 = pose ? pose.y : py;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < n; i += 1) {
        const a = A0[i] ?? 0;
        const z = Math.sin(a);
        if ((pass === 0) !== z < 0) continue;
        const r = R0[i] ?? 0;
        const x = CX + r * Math.cos(a);
        const y = (Y0[i] ?? FLOOR) + r * z * TILT;
        const size = ((ps[i] ?? 1) * (z < 0 ? 0.82 : 1)) / k;
        const tumble = pt[i] ?? 0;
        const face = Math.abs(Math.cos(tumble));
        const flash =
          Math.pow(Math.max(0, Math.cos(tumble - 0.6)), 22) * glintGain;
        const lit = (z < 0 ? 0.45 : 0.7) + face * 0.3 + flash * 0.45;
        const palette = tones[pc[i] ?? 0] ?? tones[0];
        if (!palette) continue;
        target.fillStyle = palette[level(lit)] ?? sparkle;
        const wv = size * (0.4 + 0.9 * face);
        target.fillRect(x - wv / 2, y - size / 2, wv, size);
        if (flash > 0.7) {
          // The brightest faces flare into a small four-point star.
          const arm = (1.6 + flash * 2.2) / k;
          target.fillStyle = sparkle;
          target.globalAlpha = flash * 0.9;
          target.fillRect(x - arm, y - 0.18 / k, arm * 2, 0.36 / k);
          target.fillRect(x - 0.18 / k, y - arm, 0.36 / k, arm * 2);
          target.globalAlpha = 1;
        }
      }
    }
    target.restore();
    // The surface seen edge-on, and the mouth of the funnel.
    target.strokeStyle = highlight;
    target.lineWidth = 0.8;
    target.beginPath();
    target.ellipse(CX, top - rise * 0.66, R - 0.5, R * TILT, 0, 0, TAU);
    target.globalAlpha = 0.55;
    target.stroke();
    if (reach > 2) {
      target.beginPath();
      target.ellipse(CX, top + rise * 0.34, mouth, mouth * TILT, 0, 0, TAU);
      target.globalAlpha = 0.7;
      target.stroke();
    }
    target.globalAlpha = 1;
  };

  const draw = () => {
    if (!ctx || !cfg) return;
    ctx.setTransform(scale * k, 0, 0, scale * k, 0, 0);
    ctx.clearRect(0, 0, VB_W, VB_H);
    if (!cfg.motionSafe && stillA && stillB) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1 - mix;
      ctx.drawImage(stillA, 0, 0);
      ctx.globalAlpha = mix;
      ctx.drawImage(stillB, 0, 0);
      ctx.globalAlpha = 1;
      return;
    }
    paint(ctx, depth, clamp(Math.abs(omega) / omegaMax(), 0, 1), null);
    if (!box.hasAttribute("data-live")) box.setAttribute("data-live", "");
  };

  /** Two stills for reduced motion: the settled jar, and the funnel formed. */
  const buildStills = () => {
    const c = cfg;
    if (!c || c.motionSafe || canvas.width < 2) {
      stillA = null;
      stillB = null;
      return;
    }
    const make = (funnel: number, share: number, pose: Pose) => {
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const o = off.getContext("2d");
      if (o) {
        o.setTransform(scale * k, 0, 0, scale * k, 0, 0);
        paint(o, funnel, share, pose);
      }
      return off;
    };
    const top = surfaceY();
    const settled: Pose = {
      r: new Float32Array(n),
      a: new Float32Array(n),
      y: new Float32Array(n),
    };
    const spiral: Pose = {
      r: new Float32Array(n),
      a: new Float32Array(n),
      y: new Float32Array(n),
    };
    const s = Math.round(c.seed);
    for (let i = 0; i < n; i += 1) {
      const rn = Math.sqrt(hash(s, i, 1));
      settled.r[i] = rn * (R - 3);
      settled.a[i] = hash(s, i, 2) * TAU;
      // A few flakes still hang in the water.
      settled.y[i] =
        hash(s, i, 11) < 0.06
          ? lerp(top + 20, FLOOR - 30, hash(s, i, 12))
          : FLOOR - (heap[i] ?? 1.5);
      const u = hash(s, i, 13);
      const yy = lerp(top + 8, FLOOR - 6, u);
      spiral.y[i] = yy;
      spiral.a[i] = u * 6 + hash(s, i, 2) * 2.4;
      spiral.r[i] =
        lerp(R * 0.3, R - 4, Math.pow(hash(s, i, 1), 0.6)) * lerp(1, 0.55, u);
    }
    const share = 0.75;
    const prev = clock;
    clock = 0;
    stillA = make(0, 0, settled);
    stillB = make(lerp(0.45, 0.9, clamp(c.swirl, 0, 1)) * 0.8, share, spiral);
    clock = prev;
  };

  const settledNow = () => {
    for (let i = 0; i < n; i += 1) if (!rest[i]) return false;
    return true;
  };

  const classify = (): CycloneJarState => {
    const s = Math.abs(omega) / omegaMax();
    if (s > 0.1 || clock - lastInput < 0.3) return "swirling";
    if (depth > 0.01 || Math.abs(depthV) > 0.01 || !settledNow())
      return "settling";
    return "still";
  };

  const live = () => {
    const c = cfg;
    if (!c || c.paused) return false;
    if (!c.motionSafe)
      return Math.abs(mix - mixTarget) > 0.001 || mixTarget > 0;
    return classify() !== "still";
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
        acc = Math.min(acc + dt, 0.1);
        while (acc >= STEP) {
          step(STEP);
          acc -= STEP;
        }
      } else {
        clock += dt;
        omega *= Math.exp(-dt / lerp(5, 1.4, clamp(c.viscosity, 0, 1)));
        if (clock > holdUntil && Math.abs(omega) / omegaMax() < 0.1)
          mixTarget = 0;
        // A tween, not a spring: reduced motion cross-fades.
        const rate = dt / (durations.slow + 0.0001);
        mix += clamp(mixTarget - mix, -rate, rate);
      }
    }
    const next = c.motionSafe
      ? classify()
      : mixTarget > 0
        ? "swirling"
        : "still";
    if (next !== state) {
      state = next;
      report(next);
    }
    draw();
    if (live()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!live()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const c = cfg;
    if (!c) return;
    probe.style.color = c.waterColor;
    const [wr, wg, wb, alpha] = read(getComputedStyle(probe).color);
    waterTop = `rgba(${wr}, ${wg}, ${wb}, ${r2(alpha * 0.7)})`;
    waterBottom = `rgba(${Math.round(wr * 0.75)}, ${Math.round(wg * 0.8)}, ${Math.round(wb * 0.9)}, ${r2(Math.min(1, alpha * 1.15))})`;
    if (ctx) {
      waterGrad = ctx.createLinearGradient(0, surfaceY(), 0, FLOOR);
      waterGrad.addColorStop(0, waterTop);
      waterGrad.addColorStop(1, waterBottom);
    }
    probe.style.color = "var(--background)";
    const [br, bg, bb] = read(getComputedStyle(probe).color);
    const dark = 0.2126 * br + 0.7152 * bg + 0.0722 * bb < 128;
    highlight = dark
      ? "rgba(235, 242, 255, 0.85)"
      : "rgba(255, 255, 255, 0.95)";
    sparkle = dark ? "rgb(255, 252, 240)" : "rgb(255, 255, 255)";
    tones = c.colors.slice(0, 8).map((colour) => {
      // Canvas cannot resolve var(): let the element resolve it first.
      probe.style.color = colour;
      const [r, g, b] = read(getComputedStyle(probe).color);
      // Twelve steps of the flake's own colour from shade to full, then four
      // past it toward white for the glint.
      return Array.from({ length: 16 }, (_, j) => {
        // On a light page shaded flakes read as grit: keep them nearer their colour.
        const lo = dark ? 0.32 : 0.62;
        const f = j < 12 ? lo + (j / 11) * (1 - lo) : 1;
        const w = j < 12 ? 0 : (j - 11) / 4;
        const ch = (v: number) =>
          Math.round(clamp(v * f + (255 - v * f) * w * 0.8, 0, 255));
        return `rgb(${ch(r)}, ${ch(g)}, ${ch(b)})`;
      });
    });
    if (tones.length === 0) tones = [[sparkle]];
    buildStills();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (w < 1 || h < 1) return;
    scale = Math.min(clamp(c.dpr, 0.5, 2), window.devicePixelRatio || 1);
    k = w / VB_W;
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    buildStills();
    draw();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        // First frame: glitter that has just been shaken, drifting down.
        seedFlakes(next, next.motionSafe);
        state = next.motionSafe ? "settling" : "still";
        report(state);
        readColours();
        resize();
        kick();
        return;
      }
      if (was.particles !== next.particles || was.seed !== next.seed) {
        seedFlakes(next, !settledNow() || Math.abs(omega) > 0);
      }
      if (was.colorKey !== next.colorKey || was.fill !== next.fill)
        readColours();
      else if (was.motionSafe !== next.motionSafe || was.swirl !== next.swirl)
        buildStills();
      if (was.dpr !== next.dpr) resize();
      if (!next.motionSafe && was.motionSafe) {
        for (let i = 0; i < n; i += 1) {
          rest[i] = 1;
          py[i] = FLOOR - (heap[i] ?? 1.5);
        }
        omega = 0;
        depth = 0;
        depthV = 0;
        buildStills();
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    stir(radians) {
      const c = cfg;
      if (!c) return;
      const max = omegaMax();
      omega = clamp(
        omega + radians * lerp(0.55, 1.5, clamp(c.swirl, 0, 1)),
        -max,
        max,
      );
      lastInput = clock;
      if (!c.motionSafe) {
        mixTarget = 1;
        holdUntil = clock + 1.2;
      }
      kick();
    },
    push(share) {
      const c = cfg;
      if (!c) return;
      const max = omegaMax();
      omega = clamp(omega + share * max, -max, max);
      lastInput = clock;
      if (!c.motionSafe) {
        mixTarget = 1;
        holdUntil = clock + 1.6;
      }
      kick();
    },
    spin: () => omega / omegaMax(),
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      box.removeAttribute("data-live");
    },
  };
}

/**
 * A tall glass jar of water and fine glitter, seen side-on and a little from
 * above, so orbiting flakes trace thin ellipses. Drag in circles over it — the
 * hand's travel around the jar's axis is torque, so circles spin the water up
 * and a scrub barely does — and a funnel forms down the middle, deepening
 * with the spin squared on the springs.drift constants and narrowing as it
 * goes. The flow is a Rankine vortex with a secondary circulation, so glitter
 * spirals faster as it is drawn down toward the narrow core, is lifted round
 * the funnel and thrown out under the surface.
 *
 * Stop and the spin dies away: the funnel slows, widens and collapses, and
 * the glitter drifts down fluttering, gathering into a mound in the middle of
 * the floor. Flakes glint as their faces turn to the light. Arrow keys push
 * the water round (right clockwise, left anticlockwise), Enter gives a full
 * swirl. Canvas 2D, flakes in typed arrays, the loop only while something
 * moves. Under reduced motion it is a settled jar that cross-fades to a still
 * of the formed funnel and back.
 */
export function CycloneJar({
  swirl = 0.6,
  particles = 700,
  glass = "clear",
  colors = DEFAULT_COLORS,
  waterColor,
  fill = 0.86,
  viscosity = 0.4,
  sink = 0.5,
  glint = 0.7,
  onStateChange,
  sound = false,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Glitter jar",
  disabled = false,
  className,
}: CycloneJarProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const tintId = `${uid}-tint`;
  const shineId = `${uid}-shine`;
  const lidId = `${uid}-lid`;
  const baseId = `${uid}-base`;
  const g = GLASS[glass] ?? GLASS.clear;
  const water =
    waterColor ??
    `color-mix(in oklab, light-dark(oklch(from var(--accent) 0.82 0.06 calc(h - 32) / 0.5), oklch(from var(--accent) 0.36 0.08 calc(h - 32) / 0.62)) 78%, ${g.tint})`;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const hand = React.useRef({ angle: 0, travel: 0, dir: 1 });
  const lastDir = React.useRef(1);

  const config: Config = {
    swirl,
    particles,
    colorKey: `${colors.join("|")}|${water}`,
    colors,
    waterColor: water,
    fill,
    viscosity,
    sink,
    glint,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef({ config, onStateChange });

  React.useEffect(() => {
    latest.current = { config, onStateChange };
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const probe = probeRef.current;
    if (!box || !canvas || !probe) return;
    let spoken: CycloneJarState | null = null;
    const e = createEngine(box, canvas, probe, visible, (state) => {
      latest.current.onStateChange?.(state);
      // Say it once per change, and never the first report.
      if (spoken !== null && state !== "settling") {
        setSaid((v) => ({
          n: v.n + 1,
          text: state === "swirling" ? "Swirling." : "Settled.",
        }));
      }
      spoken = state;
    });
    engine.current = e;
    e.configure(latest.current.config);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(box);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) e.wake();
    });
    watcher.observe(box);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const centre = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const top = restSurface(fill);
    return {
      x: r.left + r.width / 2,
      y: r.top + ((top + FLOOR) / 2 / VB_H) * r.height,
    };
  };

  const swish = (spin: number, clientX?: number) => {
    const s = clamp(Math.abs(spin), 0, 1);
    audio.play("swish", {
      pitch: r2(0.8 + s * 0.6),
      gain: r2(0.3 + s * 0.35),
      pan: clientX === undefined ? 0 : panFrom(clientX, boxRef.current),
    });
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      const c = centre();
      hand.current.angle = Math.atan2(point.y - c.y, point.x - c.x);
      hand.current.travel = 0;
    },
    onMove: ({ point }) => {
      const c = centre();
      const a = Math.atan2(point.y - c.y, point.x - c.x);
      // A hand near the axis turns no water: weight the turn by its reach.
      const reach = clamp(Math.hypot(point.x - c.x, point.y - c.y) / 30, 0, 1);
      const turn = wrap(a - hand.current.angle) * reach;
      hand.current.angle = a;
      if (turn === 0) return;
      lastDir.current = Math.sign(turn);
      engine.current?.stir(turn);
      hand.current.travel += Math.abs(turn);
      if (hand.current.travel >= Math.PI) {
        hand.current.travel -= Math.PI;
        swish(engine.current?.spin() ?? 0, point.x);
      }
    },
    onTap: () => {
      engine.current?.push(0.22 * lastDir.current);
      swish(engine.current?.spin() ?? 0.2);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const dir =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    event.preventDefault();
    lastDir.current = dir;
    engine.current?.push(0.2 * dir);
    swish(engine.current?.spin() ?? 0.2);
  };

  const top = restSurface(fill);
  // The server's frame: still water and the glitter settled in a mound.
  const mound = `M ${CX - R + 6} ${FLOOR} C ${CX - 40} ${FLOOR - 1} ${CX - 30} ${FLOOR - 10} ${CX} ${FLOOR - 11} C ${CX + 30} ${FLOOR - 10} ${CX + 40} ${FLOOR - 1} ${CX + R - 6} ${FLOOR} Z`;

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-clip [contain:paint]",
        className,
      )}
    >
      <div
        ref={boxRef}
        className="group/cyclone-jar relative h-full max-w-full"
        style={{ aspectRatio: `${VB_W} / ${VB_H}` }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="pointer-events-none absolute inset-0 size-full"
        >
          <defs>
            <linearGradient id={tintId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={g.tint} stopOpacity="0.2" />
              <stop offset="0.5" stopColor={g.tint} stopOpacity="0.06" />
              <stop offset="1" stopColor={g.tint} stopOpacity="0.22" />
            </linearGradient>
          </defs>
          <path d={OUTER} fill={`url(#${tintId})`} />
          <g className="group-data-live/cyclone-jar:hidden">
            <path d={interiorPath(top)} fill={water} />
            <path d={mound} fill={colors[0] ?? "currentColor"} opacity="0.85" />
            <ellipse
              cx={CX}
              cy={top}
              rx={R - 0.5}
              ry={r2(R * TILT)}
              fill="none"
              stroke="white"
              strokeOpacity="0.6"
              strokeWidth="0.8"
            />
          </g>
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        <svg
          aria-hidden
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="pointer-events-none absolute inset-0 size-full"
        >
          <defs>
            <linearGradient id={shineId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="white" stopOpacity="0" />
              <stop offset="0.5" stopColor="white" stopOpacity="0.55" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={lidId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="oklch(from var(--ink-2) 0.5 c h)" />
              <stop
                offset="0.3"
                stopColor="oklch(from var(--ink-2) 0.86 c h)"
              />
              <stop
                offset="0.55"
                stopColor="oklch(from var(--ink-2) 0.68 c h)"
              />
              <stop offset="1" stopColor="oklch(from var(--ink-2) 0.44 c h)" />
            </linearGradient>
            <linearGradient id={baseId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={g.tint} stopOpacity="0.15" />
              <stop offset="1" stopColor={g.tint} stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path d={OUTER} fill="none" stroke={g.edge} strokeWidth="1.4" />
          <path
            d={INNER}
            fill="none"
            stroke={g.edge}
            strokeOpacity="0.45"
            strokeWidth="0.8"
          />
          <path
            d="M 16 436 L 184 436 L 184 422 Q 184 450 162 450 L 38 450 Q 16 450 16 422 Z"
            fill={`url(#${baseId})`}
          />
          <rect
            x="20"
            y="112"
            width="7"
            height="300"
            rx="3.5"
            fill={`url(#${shineId})`}
            opacity="0.55"
          />
          <rect
            x="172"
            y="118"
            width="3"
            height="270"
            rx="1.5"
            fill={`url(#${shineId})`}
            opacity="0.4"
          />
          <path
            d="M 40 70 C 30 82 22 90 20 104"
            fill="none"
            stroke="white"
            strokeOpacity="0.5"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect
            x="22"
            y="44"
            width="156"
            height="8"
            rx="3"
            fill={`url(#${lidId})`}
          />
          <rect
            x="26"
            y="6"
            width="148"
            height="40"
            rx="7"
            fill={`url(#${lidId})`}
          />
          {[14, 21, 28, 35].map((y) => (
            <line
              key={y}
              x1="28"
              x2="172"
              y1={y}
              y2={y}
              stroke="oklch(from var(--ink-2) 0.35 c h)"
              strokeOpacity="0.35"
              strokeWidth="0.8"
            />
          ))}
          <rect
            x="34"
            y="9"
            width="132"
            height="2"
            rx="1"
            fill="white"
            opacity="0.35"
          />
        </svg>
        <button
          type="button"
          aria-label={label}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          onClick={(event) => {
            // Enter, Space and assistive technology: a full swirl the way the last push went.
            if (event.detail !== 0 || disabled) return;
            engine.current?.push(0.85 * lastDir.current);
            swish(0.85);
          }}
          onKeyDown={onKeyDown}
          {...drag}
          className={cn(
            "absolute inset-0 touch-none rounded-[14%/6%] outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab active:cursor-grabbing",
          )}
        />
        <span ref={probeRef} aria-hidden className="hidden" />
      </div>
      <p id={hintId} className="sr-only">
        Drag in circles to swirl the water. Arrow keys push it round, right
        clockwise and left anticlockwise; Enter gives it a full swirl.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
