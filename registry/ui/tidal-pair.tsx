"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type TidalPairPhase = "approach" | "closest" | "bridge" | "tails";

export type TidalPairProps = {
  /** The companion's mass against the primary's, 0.1 (a small satellite) to 1 (an equal pair). @default 0.5 */
  massRatio?: number;
  /** How far the disks tilt from the plane of their orbit, in degrees, 0 (flat, long tails) to 90. @default 25 */
  inclination?: number;
  /** How many stars the two disks hold between them, 200 to 3000. @default 1600 */
  starCount?: number;
  /** The primary's and the companion's stars. @default ["var(--accent-bright)", "var(--warn)"] */
  colors?: readonly [string, string];
  /** How long the whole encounter takes to play, ms. @default 26000 */
  duration?: number;
  /** How far the orbit's plane is tilted from face-on, in degrees, 0 to 80. @default 30 */
  view?: number;
  /** How close they pass, as the closest distance over a disk's size, 0.6 (grazing) to 1.6 (wide). @default 1 */
  closeness?: number;
  /** Controlled: whether the encounter plays on by itself. */
  playing?: boolean;
  /** Initial state when uncontrolled. @default true */
  defaultPlaying?: boolean;
  /** Fires when Space or Enter starts or stops the playback, and when the arrow keys pause it to step. */
  onPlayingChange?: (playing: boolean) => void;
  /** Where in the encounter it starts, 0 (far apart) to 1 (tails unwound). @default 0.3 */
  defaultTime?: number;
  /** At the end, hold a moment, fade, and play again. @default true */
  loop?: boolean;
  /** How far an arrow key steps through the encounter, as a share of it. @default 0.025 */
  step?: number;
  /** Fires as the hand or the keys move through time, with the time from 0 to 1. */
  onScrub?: (time: number) => void;
  /** Fires when the encounter passes into a new phase: approach, closest approach, the bridge forming, the tails unwinding. */
  onPhaseChange?: (phase: TidalPairPhase) => void;
  /** Seeds the stars, so two encounters never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** No scrubbing by hand or key. @default false */
  disabled?: boolean;
  /** The accessible name of the timeline control. @default "Encounter time" */
  label?: string;
  /** Sizes the box; it fills its parent by default. */
  className?: string;
};

/** World time runs from T0 to T1; closest approach is at 0. One unit is 100 million years. */
const T0 = -3;
const T1 = 11;
const H = 0.01;
const STEPS = Math.round((T1 - T0) / H);
const EVERY = 50;
const CHECKS = Math.floor(STEPS / EVERY) + 1;
/** Softening, so no star is flung by a near miss with a core. */
const EPS2 = 0.06 * 0.06;
const CORE_EPS2 = 0.12 * 0.12;
const DISK = 0.68;
/** The orbit's eccentricity: bound, so the pair never fly out of the sky. */
const ORBIT_E = 0.55;
/** Precompute budget per frame, ms. */
const BUDGET = 5;
/** At the end: hold, then fade, ms. */
const HOLD = 1400;
const FADE = 450;
/** A flick's pace eases back to playback with this time constant, s. */
const EASE_BACK = 0.45;
const BRIGHTNESS = 3;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x3c6ef372) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** World time at a share of the encounter. */
const worldAt = (time: number) => T0 + clamp01(time) * (T1 - T0);

const phaseAt = (time: number): TidalPairPhase => {
  const t = worldAt(time);
  if (t < -0.7) return "approach";
  if (t <= 0.9) return "closest";
  if (t <= 3.6) return "bridge";
  return "tails";
};

/** The time as a sentence: millions of years either side of closest approach. */
function sayTime(time: number) {
  const t = worldAt(time);
  const myr = Math.round(Math.abs(t) * 10) * 10;
  if (myr < 20) return "Closest approach";
  const amount =
    myr >= 1000
      ? `${(myr / 1000).toFixed(1)} billion years`
      : `${myr} million years`;
  return `${amount} ${t < 0 ? "before" : "after"} closest approach`;
}

type Rgb = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;
function readRgb(el: Element | undefined): Rgb {
  if (!el) return [0, 0, 0];
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgb(0, 0, 0)";
  probe.fillStyle = getComputedStyle(el).color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

type Config = {
  massRatio: number;
  inclination: number;
  stars: number;
  duration: number;
  view: number;
  closeness: number;
  playing: boolean;
  loop: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (on: boolean) => void;
  grab: () => void;
  scrubTo: (time: number) => void;
  letGo: (pace: number) => void;
  jump: (time: number) => void;
  time: () => number;
  dispose: () => void;
};

/**
 * The encounter outside React: two cores and their disks of test stars,
 * stepped on a fixed grid with kick-drift-kick leapfrog, with checkpoints so
 * any moment can be reached exactly from the one below it.
 */
function createEncounter(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  startAt: number,
  onTime: (time: number) => void,
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let visible = false;
  let live = false;
  /** A fresh sky is not shown until the moment asked for is computed. */
  let waiting = true;
  const size = { w: 0, h: 0, dpr: 1 };
  const paint = {
    a: "rgb(0, 0, 0)",
    b: "rgb(0, 0, 0)",
    ink: "rgb(0, 0, 0)",
    dark: true,
    glowA: null as HTMLCanvasElement | null,
    glowB: null as HTMLCanvasElement | null,
  };
  let n = 0;
  let nA = 0;
  /** The working state: stars' positions and velocities, the cores'. */
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  const core = new Float64Array(12);
  /** Per star: which galaxy, and how bright (by its starting radius). */
  let kind = new Uint8Array(0);
  /** Checkpoints: stars (6 floats each) and cores (12) every EVERY steps. */
  let checks: Float32Array[] = [];
  let coreChecks: Float64Array[] = [];
  /** How far the checkpoints reach, in steps, and where the working state is. */
  let frontier = 0;
  let at = 0;
  /** Shown time, 0 to 1, and its pace (per second) after a flick. */
  let shown = clamp01(startAt);
  /** Where the playhead is drawn: past either end while the hand pulls. */
  let over = shown;
  let pace = 0;
  let scrubbing = false;
  let endedAt = 0;
  let fade = 1;
  /** Per bucket (galaxy × brightness): screen x, y. */
  const buckets = Array.from(
    { length: 2 * BRIGHTNESS },
    () => new Float32Array(3000 * 2),
  );
  const filled = new Int32Array(2 * BRIGHTNESS);

  /** Accelerations on every star (into `acc`) and on the two cores. */
  const acc = { stars: new Float32Array(0), cores: new Float64Array(6) };
  const accelerate = () => {
    const m1 = 1;
    const m2 = clamp(cfg?.massRatio ?? 0.5, 0.1, 1);
    const x1 = core[0] ?? 0;
    const y1 = core[1] ?? 0;
    const z1 = core[2] ?? 0;
    const x2 = core[3] ?? 0;
    const y2 = core[4] ?? 0;
    const z2 = core[5] ?? 0;
    const a = acc.stars;
    for (let i = 0; i < n; i += 1) {
      const o = i * 3;
      const px = pos[o] ?? 0;
      const py = pos[o + 1] ?? 0;
      const pz = pos[o + 2] ?? 0;
      const dx1 = x1 - px;
      const dy1 = y1 - py;
      const dz1 = z1 - pz;
      const r1 = dx1 * dx1 + dy1 * dy1 + dz1 * dz1 + EPS2;
      const f1 = m1 / (r1 * Math.sqrt(r1));
      const dx2 = x2 - px;
      const dy2 = y2 - py;
      const dz2 = z2 - pz;
      const r2 = dx2 * dx2 + dy2 * dy2 + dz2 * dz2 + EPS2;
      const f2 = m2 / (r2 * Math.sqrt(r2));
      a[o] = dx1 * f1 + dx2 * f2;
      a[o + 1] = dy1 * f1 + dy2 * f2;
      a[o + 2] = dz1 * f1 + dz2 * f2;
    }
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const r = dx * dx + dy * dy + dz * dz + CORE_EPS2;
    const f = 1 / (r * Math.sqrt(r));
    acc.cores[0] = dx * f * m2;
    acc.cores[1] = dy * f * m2;
    acc.cores[2] = dz * f * m2;
    acc.cores[3] = -dx * f * m1;
    acc.cores[4] = -dy * f * m1;
    acc.cores[5] = -dz * f * m1;
  };

  /** One kick-drift-kick step of everything. */
  const advance = () => {
    const a = acc.stars;
    const half = H / 2;
    for (let i = 0; i < n * 3; i += 1)
      vel[i] = (vel[i] ?? 0) + (a[i] ?? 0) * half;
    for (let c = 0; c < 6; c += 1)
      core[6 + c] = (core[6 + c] ?? 0) + (acc.cores[c] ?? 0) * half;
    for (let i = 0; i < n * 3; i += 1)
      pos[i] = (pos[i] ?? 0) + (vel[i] ?? 0) * H;
    for (let c = 0; c < 6; c += 1)
      core[c] = (core[c] ?? 0) + (core[6 + c] ?? 0) * H;
    accelerate();
    for (let i = 0; i < n * 3; i += 1)
      vel[i] = (vel[i] ?? 0) + (a[i] ?? 0) * half;
    for (let c = 0; c < 6; c += 1)
      core[6 + c] = (core[6 + c] ?? 0) + (acc.cores[c] ?? 0) * half;
    at += 1;
    if (at % EVERY === 0) {
      const k = at / EVERY;
      if (k > frontier / EVERY && k < CHECKS) save(k);
    }
  };

  const save = (k: number) => {
    const buf = checks[k] ?? new Float32Array(n * 6);
    buf.set(pos, 0);
    buf.set(vel, n * 3);
    checks[k] = buf;
    const cb = coreChecks[k] ?? new Float64Array(12);
    cb.set(core);
    coreChecks[k] = cb;
    frontier = Math.max(frontier, k * EVERY);
  };

  const load = (k: number) => {
    const buf = checks[k];
    const cb = coreChecks[k];
    if (!buf || !cb) return false;
    pos.set(buf.subarray(0, n * 3));
    vel.set(buf.subarray(n * 3, n * 6));
    core.set(cb);
    at = k * EVERY;
    accelerate();
    return true;
  };

  /** The first moment: the cores on their orbit, the disks in circular orbits. */
  const build = (c: Config) => {
    const rand = lcg(c.seed * 59 + 11);
    const q = clamp(c.massRatio, 0.1, 1);
    const M = 1 + q;
    const total = Math.round(clamp(c.stars, 200, 3000));
    // Stars by mass: the companion holds its share.
    nA = Math.round(total / (1 + q * 0.8));
    n = total;
    pos = new Float32Array(n * 3);
    vel = new Float32Array(n * 3);
    acc.stars = new Float32Array(n * 3);
    kind = new Uint8Array(n);
    checks = [];
    coreChecks = [];
    frontier = 0;
    at = 0;
    waiting = true;
    // A bound orbit: the companion passes close, swings out to a few disk
    // widths and is starting back by the end, so the pair stay in the sky.
    const rp = clamp(c.closeness, 0.6, 1.6) * DISK * 1.45;
    const e = ORBIT_E;
    const a = rp / (1 - e);
    const mean = Math.sqrt(M / (a * a * a));
    // Kepler's equation, so the pass happens exactly at the timeline's mark.
    const M0 = mean * T0;
    let E = M0;
    for (let k = 0; k < 40; k += 1) {
      E -= (E - e * Math.sin(E) - M0) / (1 - e * Math.cos(E));
    }
    const fStart =
      2 * Math.atan(Math.sqrt((1 + e) / (1 - e)) * Math.tan(E / 2));
    const r0 = a * (1 - e * Math.cos(E));
    const rx = r0 * Math.cos(fStart);
    const ry = r0 * Math.sin(fStart);
    const p = a * (1 - e * e);
    const vRad = Math.sqrt(M / p) * e * Math.sin(fStart);
    const vTan = Math.sqrt(M / p) * (1 + e * Math.cos(fStart));
    const vx = vRad * Math.cos(fStart) - vTan * Math.sin(fStart);
    const vy = vRad * Math.sin(fStart) + vTan * Math.cos(fStart);
    // The orbit's long axis lies across the view: the companion sweeps
    // round the primary's right side and swings out to the left, so a wide
    // box holds the whole encounter.
    const turn = 0;
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    const RX = rx * ct - ry * st;
    const RY = rx * st + ry * ct;
    const VX = vx * ct - vy * st;
    const VY = vx * st + vy * ct;
    core.fill(0);
    core[0] = (-q / M) * RX;
    core[1] = (-q / M) * RY;
    core[3] = (1 / M) * RX;
    core[4] = (1 / M) * RY;
    core[6] = (-q / M) * VX;
    core[7] = (-q / M) * VY;
    core[9] = (1 / M) * VX;
    core[10] = (1 / M) * VY;
    // Each disk: prograde, tilted from the orbit's plane.
    const tilt1 = (clamp(c.inclination, 0, 90) * Math.PI) / 180;
    const tilt2 = tilt1 * 0.6 + 0.35;
    const spin2 = rand() * Math.PI * 2;
    for (let i = 0; i < n; i += 1) {
      const isA = i < nA;
      const host = isA ? 0 : 3;
      const mass = isA ? 1 : q;
      const rMax = DISK * (isA ? 1 : Math.sqrt(q) * 0.95);
      const rMin = isA ? 0.08 : 0.06;
      // More stars toward the middle, as a disk has.
      const u = rand();
      const r = rMin + (rMax - rMin) * Math.pow(u, 0.75);
      const a = rand() * Math.PI * 2;
      const r2 = r * r;
      const v = Math.sqrt((mass * r2) / Math.pow(r2 + EPS2, 1.5));
      // In the disk's own plane, then tilted.
      let x = r * Math.cos(a);
      let y = r * Math.sin(a);
      let z = (rand() - 0.5) * 0.02;
      let ux = -v * Math.sin(a);
      let uy = v * Math.cos(a);
      let uz = 0;
      const tilt = isA ? tilt1 : tilt2;
      // The primary tilts about the vertical, so its tilt does not stack
      // with the view's; the companion about a seeded axis.
      const axisTurn = isA ? Math.PI / 2 : spin2;
      // Tilt about an axis in the orbit plane at angle axisTurn.
      const ca = Math.cos(axisTurn);
      const sa = Math.sin(axisTurn);
      const ci = Math.cos(tilt);
      const si = Math.sin(tilt);
      const rot = (px: number, py: number, pz: number) => {
        // Into the axis frame, tilt about its x, back out.
        const ax = px * ca + py * sa;
        const ay = -px * sa + py * ca;
        const by = ay * ci - pz * si;
        const bz = ay * si + pz * ci;
        return [ax * ca - by * sa, ax * sa + by * ca, bz] as const;
      };
      [x, y, z] = rot(x, y, z);
      [ux, uy, uz] = rot(ux, uy, uz);
      const o = i * 3;
      pos[o] = (core[host] ?? 0) + x;
      pos[o + 1] = (core[host + 1] ?? 0) + y;
      pos[o + 2] = (core[host + 2] ?? 0) + z;
      vel[o] = (core[host + 6] ?? 0) + ux;
      vel[o + 1] = (core[host + 7] ?? 0) + uy;
      vel[o + 2] = (core[host + 8] ?? 0) + uz;
      const share = (r - rMin) / (rMax - rMin);
      kind[i] =
        (isA ? 0 : BRIGHTNESS) + (share < 0.3 ? 0 : share < 0.65 ? 1 : 2);
    }
    accelerate();
    save(0);
  };

  /** Fills checkpoints in the background, a few ms a frame. */
  const precompute = (): boolean => {
    if (frontier >= STEPS || n === 0) return false;
    const start = performance.now();
    // Restore the working state afterwards: precompute runs ahead of the
    // shown moment on its own copy of time.
    const shownAt = at;
    if (at !== frontier) load(frontier / EVERY);
    while (frontier < STEPS && performance.now() - start < BUDGET) {
      for (let s = 0; s < EVERY && at < STEPS; s += 1) advance();
      if (at % EVERY !== 0) frontier = STEPS;
    }
    if (at !== shownAt) seek(shownAt);
    return frontier < STEPS;
  };

  /** Brings the working state to step `k`, exactly, from the checkpoint below it. */
  const seek = (k: number) => {
    const target = clamp(
      Math.round(k),
      0,
      Math.min(STEPS, frontier + EVERY - 1),
    );
    if (target === at) return;
    if (target < at || target - at > EVERY) {
      const base = Math.min(
        Math.floor(target / EVERY),
        Math.floor(frontier / EVERY),
      );
      load(base);
    }
    while (at < target) advance();
  };

  const paintColours = () => {
    const kids = carriers.children;
    const a = readRgb(kids[0]);
    const b = readRgb(kids[1]);
    const ink = readRgb(kids[2]);
    const ground = readRgb(kids[3]);
    paint.a = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
    paint.b = `rgb(${b[0]}, ${b[1]}, ${b[2]})`;
    paint.ink = `rgb(${ink[0]}, ${ink[1]}, ${ink[2]})`;
    paint.dark =
      (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 <
      0.5;
    const sprite = (rgb: Rgb, into: HTMLCanvasElement | null) => {
      const s = into ?? document.createElement("canvas");
      s.width = 96;
      s.height = 96;
      const sc = s.getContext("2d");
      if (sc) {
        sc.clearRect(0, 0, 96, 96);
        const g = sc.createRadialGradient(48, 48, 0, 48, 48, 48);
        g.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.95)`);
        g.addColorStop(0.18, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`);
        g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        sc.fillStyle = g;
        sc.fillRect(0, 0, 96, 96);
      }
      return s;
    };
    paint.glowA = sprite(a, paint.glowA);
    paint.glowB = sprite(b, paint.glowB);
  };

  const draw = () => {
    const c = cfg;
    const ctx = canvas.getContext("2d");
    if (!c || !ctx || !visible || size.w < 1 || n === 0) return;
    const { w, h, dpr } = size;
    // Until the checkpoints reach the moment asked for, the still frame
    // stays: nothing fast-forwards on screen.
    if (shown * STEPS > frontier + EVERY - 1 && waiting) return;
    waiting = false;
    seek(shown * STEPS);
    const view = (clamp(c.view, 0, 80) * Math.PI) / 180;
    const cv = Math.cos(view);
    const sv = Math.sin(view);
    // The frame follows the pair: centred a little toward the companion
    // from the primary, pulled back as they part, so the bridge and the
    // tails stay in view. It is a function of the moment, never of how it
    // was reached, so a scrub frames the same sky every time.
    const p1x = core[0] ?? 0;
    const p1y = (core[1] ?? 0) * cv - (core[2] ?? 0) * sv;
    const p2x = core[3] ?? 0;
    const p2y = (core[4] ?? 0) * cv - (core[5] ?? 0) * sv;
    const S = Math.min(
      w / 4.4,
      h / 2.2,
      (w * 0.92) / (Math.abs(p2x - p1x) + 2.3),
      (h * 0.86) / (Math.abs(p2y - p1y) + 1.8),
    );
    const mx = p1x + (p2x - p1x) * 0.38;
    const my = p1y + (p2y - p1y) * 0.38;
    const cx = w / 2 - mx * S;
    const cy = h * 0.47 + my * S;
    filled.fill(0);
    for (let i = 0; i < n; i += 1) {
      const o = i * 3;
      const x = pos[o] ?? 0;
      const y = (pos[o + 1] ?? 0) * cv - (pos[o + 2] ?? 0) * sv;
      const sx = cx + x * S;
      const sy = cy - y * S;
      if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) continue;
      const b = kind[i] ?? 0;
      const m = filled[b] ?? 0;
      const buf = buckets[b];
      if (!buf || m >= 3000) continue;
      buf[m * 2] = sx;
      buf[m * 2 + 1] = sy;
      filled[b] = m + 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const additive = paint.dark;
    ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
    // The cores: a soft bulge each, sized by mass.
    const m2 = clamp(c.massRatio, 0.1, 1);
    for (let g = 0; g < 2; g += 1) {
      const sprite = g === 0 ? paint.glowA : paint.glowB;
      if (!sprite) continue;
      const x = core[g * 3] ?? 0;
      const y = (core[g * 3 + 1] ?? 0) * cv - (core[g * 3 + 2] ?? 0) * sv;
      const r = S * 0.42 * Math.cbrt(g === 0 ? 1 : m2);
      ctx.globalAlpha = fade * (additive ? 0.7 : 0.35);
      ctx.drawImage(sprite, cx + x * S - r, cy - y * S - r, r * 2, r * 2);
    }
    // The outer stars are the ones the tails are made of: they stay bright
    // enough to read when they are strung out thin.
    const sizes = [1.6, 1.3, 1.15];
    const alphas = additive ? [0.95, 0.8, 0.7] : [0.9, 0.78, 0.66];
    for (let b = 0; b < 2 * BRIGHTNESS; b += 1) {
      const m = filled[b] ?? 0;
      const buf = buckets[b];
      if (!m || !buf) continue;
      const level = b % BRIGHTNESS;
      const dot = sizes[level] ?? 1;
      ctx.beginPath();
      for (let p = 0; p < m; p += 1) {
        ctx.rect(
          (buf[p * 2] ?? 0) - dot / 2,
          (buf[p * 2 + 1] ?? 0) - dot / 2,
          dot,
          dot,
        );
      }
      ctx.fillStyle = b < BRIGHTNESS ? paint.a : paint.b;
      ctx.globalAlpha = fade * (alphas[level] ?? 0.6);
      ctx.fill();
    }
    // The timeline along the bottom: where you are, and closest approach.
    ctx.globalCompositeOperation = "source-over";
    const left = 12;
    const right = w - 12;
    const y = h - 8;
    ctx.strokeStyle = paint.ink;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y + 0.5);
    ctx.lineTo(right, y + 0.5);
    const peri = left + ((0 - T0) / (T1 - T0)) * (right - left);
    ctx.moveTo(Math.round(peri) + 0.5, y - 3);
    ctx.lineTo(Math.round(peri) + 0.5, y + 4);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(left, y + 0.5);
    const head = left + over * (right - left);
    ctx.lineTo(head, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = paint.ink;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(head, y + 0.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  /** Advances the shown time; says whether anything still moves. */
  const step = (dt: number, now: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = precompute();
    if (!c.motionSafe || scrubbing) return moving;
    const rate = c.playing ? 1 / (Math.max(2000, c.duration) / 1000) : 0;
    pace += (rate - pace) * (1 - Math.exp(-dt / EASE_BACK));
    if (Math.abs(pace - rate) < 1e-4) pace = rate;
    const reach = Math.min(1, frontier / STEPS);
    if (endedAt) {
      // Held at the end, then faded, then back to the start.
      const since = now - endedAt;
      if (!c.loop || !c.playing) {
        endedAt = 0;
        fade = 1;
        return moving;
      }
      if (since < HOLD) fade = 1;
      else if (since < HOLD + FADE) fade = 1 - (since - HOLD) / FADE;
      else if (since < HOLD + FADE * 2) {
        if (shown !== 0) {
          shown = 0;
          over = 0;
          onTime(shown);
        }
        fade = (since - HOLD - FADE) / FADE;
      } else {
        fade = 1;
        endedAt = 0;
      }
      return true;
    }
    if (pace !== 0) {
      const next = clamp(shown + pace * dt, 0, 1);
      if (next > reach) {
        // Ahead of the checkpoints: wait for them rather than jump back.
        moving = true;
      } else if (next !== shown) {
        shown = next;
        over = next;
        onTime(shown);
        moving = true;
      }
      if (shown >= 1 && c.playing) endedAt = now;
      if (Math.abs(pace - rate) > 1e-4) moving = true;
    }
    return moving || endedAt !== 0;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt, now);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      const rebuild =
        !was ||
        was.massRatio !== next.massRatio ||
        was.inclination !== next.inclination ||
        was.stars !== next.stars ||
        was.closeness !== next.closeness ||
        was.seed !== next.seed;
      if (rebuild) build(next);
      if (!was) {
        if (!next.motionSafe) {
          shown = Math.max(shown, 0.55);
          over = shown;
          onTime(shown);
        }
        paintColours();
        resize();
        return;
      }
      if (was.colourKey !== next.colourKey) paintColours();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (!next.motionSafe) {
        pace = 0;
        endedAt = 0;
        fade = 1;
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      paintColours();
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on) {
        draw();
        kick();
      }
    },
    grab() {
      scrubbing = true;
      endedAt = 0;
      fade = 1;
      pace = 0;
    },
    scrubTo(time) {
      // Past either end the sky holds while the playhead rubber-bands.
      over = clamp(time, -0.1, 1.1);
      shown = clamp01(time);
      onTime(shown);
      draw();
      kick();
    },
    letGo(flick) {
      scrubbing = false;
      over = shown;
      pace = cfg?.motionSafe ? clamp(flick, -0.6, 0.6) : 0;
      kick();
    },
    jump(time) {
      endedAt = 0;
      fade = 1;
      pace = 0;
      shown = clamp01(time);
      over = shown;
      onTime(shown);
      draw();
      kick();
    },
    time: () => shown,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * Two small spiral galaxies on a slow, close pass, drawn in Canvas 2D
 * points: a restricted three-body encounter in which two cores swing past each
 * other on a bound orbit and every star of their disks feels both. As they pass,
 * the near sides are drawn into a bridge of stars between them and the far
 * sides fling out into long tidal tails that wrap and unwind.
 *
 * Time is a fixed grid of leapfrog steps with checkpoints filled in the
 * background, so any moment is reached exactly — a scrub shows the same sky
 * every time. It plays on its own at an unhurried pace and loops with a fade;
 * drag sideways to scrub through it 1:1 (the full width is the whole
 * encounter), and let go: a flick carries on and its pace eases back to
 * playback. It is a slider through time: arrows step it, Space plays and
 * pauses, Home and End jump. Under reduced motion it holds a still frame of
 * the tails and moves only when stepped or scrubbed.
 */
export function TidalPair({
  massRatio = 0.5,
  inclination = 25,
  starCount = 1600,
  colors = ["var(--accent-bright)", "var(--warn)"],
  duration = 26000,
  view = 30,
  closeness = 1,
  playing,
  defaultPlaying = true,
  onPlayingChange,
  defaultTime = 0.3,
  loop = true,
  step = 0.025,
  onScrub,
  onPhaseChange,
  seed = 1,
  dpr = 2,
  disabled = false,
  label = "Encounter time",
  className,
}: TidalPairProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = playing ?? ownPlaying;
  const [said, setSaid] = React.useState(() => ({
    time: clamp01(defaultTime),
    phase: phaseAt(defaultTime),
  }));
  const [first = "var(--accent-bright)", second = "var(--warn)"] = colors;
  const paints = React.useMemo(
    () => [first, second, "var(--foreground)", "var(--background)"] as const,
    [first, second],
  );
  const colourKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const report = React.useRef({ onPlayingChange, onScrub, onPhaseChange });
  const phase = React.useRef(said.phase);
  const startAt = React.useRef(clamp01(defaultTime));
  const scrubFrom = React.useRef(0);

  const config: Config = {
    massRatio,
    inclination,
    stars: starCount,
    duration,
    view,
    closeness,
    playing: isPlaying,
    loop,
    seed,
    dpr,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onPlayingChange, onScrub, onPhaseChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    // The time is told to React only when its phase changes: the slider's
    // reading stays current without a render every frame.
    const onTime = (time: number) => {
      const next = phaseAt(time);
      if (next === phase.current) return;
      phase.current = next;
      setSaid({ time, phase: next });
      report.current.onPhaseChange?.(next);
    };
    const e = createEncounter(root, canvas, carriers, startAt.current, onTime);
    engine.current = e;
    e.configure(latest.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting) && !document.hidden);
    });
    watcher.observe(root);
    const onVisibility = () => {
      const r = root.getBoundingClientRect();
      e.setVisible(
        !document.hidden && r.bottom > 0 && r.top < window.innerHeight,
      );
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const setPlaying = (next: boolean) => {
    if (next === isPlaying) return;
    // Played from the very end, it starts again from the beginning.
    if (next && (engine.current?.time() ?? 0) >= 0.999) {
      engine.current?.jump(0);
      tellTime(0);
    }
    if (playing === undefined) setOwnPlaying(next);
    report.current.onPlayingChange?.(next);
  };

  /** A moment set by the hand or a key: told to the slider and the host. */
  const tellTime = (time: number) => {
    const t = clamp01(time);
    setSaid({ time: t, phase: phaseAt(t) });
    report.current.onScrub?.(Math.round(t * 1000) / 1000);
  };

  const width = () => rootRef.current?.clientWidth || 1;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      const e = engine.current;
      if (!e) return;
      scrubFrom.current = e.time();
      e.grab();
    },
    onMove: ({ offset }) => {
      const raw = scrubFrom.current + offset.x / width();
      // Past either end the playhead rubber-bands; the sky holds.
      const t = rubberClamp(raw, 0, 1, 0.12);
      engine.current?.scrubTo(t);
      report.current.onScrub?.(Math.round(clamp01(t) * 1000) / 1000);
    },
    onEnd: ({ velocity }) => {
      const e = engine.current;
      if (!e) return;
      e.letGo(velocity.x / width());
      tellTime(e.time());
    },
    onCancel: () => engine.current?.letGo(0),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const e = engine.current;
    if (!e) return;
    const now = e.time();
    const by = clamp(step, 0.005, 0.25);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = now + by;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = now - by;
        break;
      case "PageUp":
        next = now + by * 4;
        break;
      case "PageDown":
        next = now - by * 4;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        if (!event.repeat) setPlaying(!isPlaying);
        return;
      default:
        return;
    }
    event.preventDefault();
    // Stepping is looking closely: playback pauses so the step holds.
    setPlaying(false);
    e.jump(next);
    tellTime(next);
  };

  const percent = Math.round(said.time * 100);

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/tidal-pair relative isolate h-full w-full overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/tidal-pair:invisible group-data-live/tidal-pair:opacity-0"
        style={standIn(first, second)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={sayTime(said.time)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          // A sideways drag scrubs time; an upright swipe scrolls the page.
          "absolute inset-0 touch-pan-y rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-ew-resize",
        )}
      />
      <p id={hintId} className="sr-only">
        Drag sideways or use the arrow keys to move through the encounter; Space
        plays and pauses it.
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * two galaxies as soft glows, the smaller one following.
 */
function standIn(first: string, second: string): React.CSSProperties {
  return {
    backgroundImage: [
      `radial-gradient(ellipse 16% 22% at 42% 46%, color-mix(in oklab, ${first} 55%, transparent), transparent)`,
      `radial-gradient(ellipse 28% 14% at 42% 46%, color-mix(in oklab, ${first} 22%, transparent), transparent)`,
      `radial-gradient(ellipse 10% 15% at 62% 40%, color-mix(in oklab, ${second} 55%, transparent), transparent)`,
    ].join(", "),
  };
}
