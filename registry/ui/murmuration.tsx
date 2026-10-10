"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type MurmurationProps = {
  /** How many birds, 50 to 2,400. @default 900 */
  count?: number;
  /** How strongly the pointer draws the flock and wheels it round, 0 to 1. @default 0.5 */
  attraction?: number;
  /** Flight speed, as a multiple of the natural pace (0.25 to 3). @default 1 */
  speed?: number;
  /** How tightly the birds keep together, 0 to 1. @default 0.5 */
  cohesion?: number;
  /** How closely each bird matches its neighbours' heading, 0 to 1. @default 0.6 */
  alignment?: number;
  /** How much room each bird keeps, 0 to 1. @default 0.5 */
  separation?: number;
  /** The radius the flock wheels at around the pointer, px. @default 64 */
  orbit?: number;
  /** A bird's size at middle depth, px. @default 1.6 */
  bird?: number;
  /** How hard a passing hawk scatters the flock, 0 to 1. @default 0.6 */
  scatter?: number;
  /** The birds' ink. @default "var(--foreground)" */
  color?: string;
  /** Paint a dusk sky behind the flock. @default true */
  sky?: boolean;
  /** Paint a reed bed along the bottom. @default true */
  horizon?: boolean;
  /** The flock's starting formation and the reeds. @default 7 */
  seed?: number;
  /** Hold the flock still. @default false */
  paused?: boolean;
  /** The pointer and the keyboard lead the flock and send hawks; false leaves it to itself. @default true */
  interactive?: boolean;
  /** The highest device pixel ratio drawn, capped at 2. @default 2 */
  dpr?: number;
  /** The accessible name of the keyboard surface. @default "Starling flock" */
  label?: string;
  /** Fires when a hawk is sent: a click, a tap, Enter or Space. */
  onHawk?: () => void;
  /** Fires when the pointer or the keys start (true) or stop (false) leading the flock. */
  onLeadChange?: (leading: boolean) => void;
  /** Content over the sky, in its own layer: a headline, a caption. */
  children?: React.ReactNode;
  /** Size the box here. @default "aspect-[2/1] w-full" */
  className?: string;
};

const MAX = 2400;
/** Neighbours each bird attends to: real starlings track about seven; a few more reads smoother. */
const NEIGHBOURS = 14;
/** A startled bird passes the fright on after this reaction time, s. */
const REACTION = 0.05;
/** How long a startle takes to fade, s. */
const FRIGHT = 0.9;
/** How long a hawk takes to cross, s, at speed 1. */
const HAWK = 1.1;
/** Presses on the content's own controls are theirs, not the flock's. */
const CONTROLS =
  "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

const SKY_TOP =
  "color-mix(in oklab, var(--accent-bright) 7%, var(--background))";
const SKY_LOW =
  "color-mix(in oklab, oklch(from var(--warn) 0.82 0.09 h) 34%, var(--background))";
const REEDS = "color-mix(in oklab, var(--foreground) 24%, var(--background))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Flock = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  bank: Float32Array;
  fright: Float32Array;
  onset: Float32Array;
  /** Which way a startled bird jinks: ±1. */
  jink: Float32Array;
  /** Spatial hash: head per cell and next per bird. */
  head: Int32Array;
  next: Int32Array;
  cols: number;
  rows: number;
  cell: number;
};

type Hawk = {
  t: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
  hx: number;
  hy: number;
};

type Sim = {
  flock: Flock;
  w: number;
  h: number;
  t: number;
  lure: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    tx: number;
    ty: number;
  };
  lead: { on: boolean; keyboard: boolean; touch: number };
  hawk: Hawk | null;
  ready: boolean;
  p: {
    count: number;
    attraction: number;
    speed: number;
    cohesion: number;
    alignment: number;
    separation: number;
    orbit: number;
    scatter: number;
  };
};

function newFlock(): Flock {
  const f = () => new Float32Array(MAX);
  return {
    n: 0,
    x: f(),
    y: f(),
    z: f(),
    vx: f(),
    vy: f(),
    vz: f(),
    bank: f(),
    fright: f(),
    onset: f(),
    jink: f(),
    head: new Int32Array(1),
    next: new Int32Array(MAX),
    cols: 1,
    rows: 1,
    cell: 24,
  };
}

/** A loose cloud of birds over the middle of the sky, from the seed. */
function seedFlock(s: Sim, seed: number, from = 0) {
  const f = s.flock;
  const rand = lcg(seed * 7919 + 13 + from);
  const pace = cruise(s);
  const depth = 0.6 * Math.min(s.w, s.h);
  for (let i = from; i < f.n; i += 1) {
    const src = from > 0 ? i % from : -1;
    if (src >= 0) {
      // A new bird joins beside an old one, so a growing flock never resets.
      f.x[i] = (f.x[src] ?? 0) + (rand() - 0.5) * 12;
      f.y[i] = (f.y[src] ?? 0) + (rand() - 0.5) * 12;
      f.z[i] = (f.z[src] ?? 0) + (rand() - 0.5) * 12;
      f.vx[i] = f.vx[src] ?? 0;
      f.vy[i] = f.vy[src] ?? 0;
      f.vz[i] = f.vz[src] ?? 0;
    } else {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      f.x[i] = s.w * (0.5 + Math.cos(a) * r * 0.22);
      f.y[i] = s.h * (0.4 + Math.sin(a) * r * 0.16);
      f.z[i] = (rand() - 0.5) * depth;
      const b = rand() * Math.PI * 2;
      f.vx[i] = Math.cos(b) * pace;
      f.vy[i] = Math.sin(b) * pace * 0.4;
      f.vz[i] = (rand() - 0.5) * pace * 0.3;
    }
    f.bank[i] = 0;
    f.fright[i] = 0;
    f.onset[i] = -10;
    f.jink[i] = rand() < 0.5 ? -1 : 1;
  }
}

/** The natural cruising pace for this box, px/s. */
const cruise = (s: Sim) =>
  clamp(0.14 * s.w, 60, 130) * clamp(s.p.speed, 0.25, 3);

/** Where the lure wanders when nobody leads: a slow figure over the sky. */
function ambient(s: Sim, t: number): [number, number] {
  return [
    s.w * (0.56 + 0.26 * Math.sin(t * 0.21) * Math.cos(t * 0.07)),
    s.h * (0.36 + 0.08 * Math.sin(t * 0.33 + 1.3)),
  ];
}

function rebuildHash(s: Sim) {
  const f = s.flock;
  // Spacing follows the box's short side, so a full flock fits a short sky.
  const cell = clamp(0.065 * Math.min(s.w, s.h) + 3, 12, 24);
  const cols = Math.max(1, Math.ceil(s.w / cell) + 2);
  const rows = Math.max(1, Math.ceil(s.h / cell) + 2);
  if (f.head.length !== cols * rows) f.head = new Int32Array(cols * rows);
  f.cols = cols;
  f.rows = rows;
  f.cell = cell;
}

/** One step of the flock: neighbours, the lure, the hawk, the fright. */
function fly(s: Sim, dt: number, still = false) {
  const f = s.flock;
  const p = s.p;
  const n = f.n;
  s.t += dt;
  const t = s.t;
  const pace = cruise(s);
  const depth = 0.6 * Math.min(s.w, s.h);
  const R = f.cell;
  const sepR = R * 0.42;

  // The lure follows its target on the drift spring's constants, so the
  // flock turns after the hand, never at once.
  const L = s.lure;
  if (!s.lead.on) [L.tx, L.ty] = ambient(s, t);
  const kk = springs.drift.stiffness / springs.drift.mass;
  const cc = springs.drift.damping / springs.drift.mass;
  if (still) {
    L.x = L.tx;
    L.y = L.ty;
  } else {
    L.vx += (kk * (L.tx - L.x) - cc * L.vx) * dt;
    L.vy += (kk * (L.ty - L.y) - cc * L.vy) * dt;
    L.x += L.vx * dt;
    L.y += L.vy * dt;
  }
  // The flock wheels about an axis that tilts slowly through the screen, so
  // its rotation folds over in depth and now and then reverses.
  let axx = Math.sin(t * 0.11) * 0.6;
  let axy = Math.cos(t * 0.07) * 0.4;
  let axz = Math.cos(t * 0.045);
  const al = Math.hypot(axx, axy, axz) || 1;
  axx /= al;
  axy /= al;
  axz /= al;

  const hawk = s.hawk;
  if (hawk) {
    hawk.t += dt / (HAWK / clamp(p.speed, 0.25, 3));
    const u = clamp01(hawk.t);
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    const nx = a * hawk.x0 + b * hawk.x1 + c * hawk.x2;
    const ny = a * hawk.y0 + b * hawk.y1 + c * hawk.y2;
    hawk.hx = nx - hawk.x;
    hawk.hy = ny - hawk.y;
    hawk.x = nx;
    hawk.y = ny;
    if (hawk.t >= 1) s.hawk = null;
  }
  const hawkR = 0.12 * Math.max(s.w, s.h) + 40;

  // Hash the birds by x and y; depth is shallow enough to check per pair.
  f.head.fill(-1);
  for (let i = 0; i < n; i += 1) {
    const cx = clamp(Math.floor((f.x[i] ?? 0) / R) + 1, 0, f.cols - 1);
    const cy = clamp(Math.floor((f.y[i] ?? 0) / R) + 1, 0, f.rows - 1);
    const cellIndex = cy * f.cols + cx;
    f.next[i] = f.head[cellIndex] ?? -1;
    f.head[cellIndex] = i;
  }

  // The flock's centre: the lure steers the body as a whole, so it wheels
  // as one cloud instead of stringing out along the orbit.
  let gx0 = 0;
  let gy0 = 0;
  let gz0 = 0;
  for (let i = 0; i < n; i += 1) {
    gx0 += f.x[i] ?? 0;
    gy0 += f.y[i] ?? 0;
    gz0 += f.z[i] ?? 0;
  }
  gx0 /= Math.max(1, n);
  gy0 /= Math.max(1, n);
  gz0 /= Math.max(1, n);
  const lureW = clamp01(p.attraction) * (s.lead.on ? 1 : 0.6);
  // A short box cannot hold a wide orbit: the cloud would hit the reeds.
  const orbit = clamp(p.orbit, 8, 0.14 * Math.min(s.w, s.h) + 8);
  const scratch = [0, 0, 0];
  const lureAt = (x: number, y: number, z: number) => {
    const dx = L.x - x;
    const dy = L.y - y;
    const dz = -z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const radial = clamp((d - orbit) / orbit, -1, 2) * 260 * lureW;
    const tx = axy * dz - axz * dy;
    const ty = axz * dx - axx * dz;
    const tz = axx * dy - axy * dx;
    const tl = Math.hypot(tx, ty, tz) || 1;
    const swirl = 150 * lureW;
    scratch[0] = (dx / d) * radial + (tx / tl) * swirl;
    scratch[1] = (dy / d) * radial + (ty / tl) * swirl;
    scratch[2] = (dz / d) * radial + (tz / tl) * swirl;
  };
  lureAt(gx0, gy0, gz0);
  const cax = scratch[0] ?? 0;
  const cay = scratch[1] ?? 0;
  const caz = scratch[2] ?? 0;
  const cohG = clamp01(p.cohesion) * 0.9;

  const aliW = clamp01(p.alignment) * 3;
  const cohW = clamp01(p.cohesion) * 3.2;
  const sepW = clamp01(p.separation) * 900;
  const margin = 0.08 * Math.min(s.w, s.h) + 12;
  const floor = s.h * 0.76;

  for (let i = 0; i < n; i += 1) {
    const xi = f.x[i] ?? 0;
    const yi = f.y[i] ?? 0;
    const zi = f.z[i] ?? 0;
    const vxi = f.vx[i] ?? 0;
    const vyi = f.vy[i] ?? 0;
    const vzi = f.vz[i] ?? 0;
    let ax = 0;
    let ay = 0;
    let az = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    let seen = 0;
    let scared = 0;
    const gx = clamp(Math.floor(xi / R) + 1, 0, f.cols - 1);
    const gy = clamp(Math.floor(yi / R) + 1, 0, f.rows - 1);
    for (let oy = -1; oy <= 1 && seen < NEIGHBOURS; oy += 1) {
      const ry = gy + oy;
      if (ry < 0 || ry >= f.rows) continue;
      for (let ox = -1; ox <= 1 && seen < NEIGHBOURS; ox += 1) {
        const rx = gx + ox;
        if (rx < 0 || rx >= f.cols) continue;
        let j = f.head[ry * f.cols + rx] ?? -1;
        while (j >= 0 && seen < NEIGHBOURS) {
          if (j !== i) {
            const dx = xi - (f.x[j] ?? 0);
            const dy = yi - (f.y[j] ?? 0);
            const dz = zi - (f.z[j] ?? 0);
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < R * R) {
              seen += 1;
              mx += f.vx[j] ?? 0;
              my += f.vy[j] ?? 0;
              mz += f.vz[j] ?? 0;
              px += f.x[j] ?? 0;
              py += f.y[j] ?? 0;
              pz += f.z[j] ?? 0;
              if (d2 < sepR * sepR && d2 > 1e-4) {
                const d = Math.sqrt(d2);
                const k = (1 - d / sepR) / d;
                ax += dx * k * sepW;
                ay += dy * k * sepW;
                az += dz * k * sepW;
              }
              // Fright travels: a neighbour startled long enough ago to
              // have been seen passes most of it on.
              const fj = f.fright[j] ?? 0;
              if (fj > scared && t - (f.onset[j] ?? 0) > REACTION) scared = fj;
            }
          }
          j = f.next[j] ?? -1;
        }
      }
    }
    if (seen > 0) {
      ax += (mx / seen - vxi) * aliW;
      ay += (my / seen - vyi) * aliW;
      az += (mz / seen - vzi) * aliW;
      ax += (px / seen - xi) * cohW;
      ay += (py / seen - yi) * cohW;
      az += (pz / seen - zi) * cohW;
    }

    // The lure: drawn toward a ring round it and carried along it — mostly
    // as a body (the force at the flock's centre), a little bird by bird, so
    // the cloud stretches and folds as it wheels.
    if (lureW > 0) {
      lureAt(xi, yi, zi);
      ax += cax * 0.7 + (scratch[0] ?? 0) * 0.3;
      ay += cay * 0.7 + (scratch[1] ?? 0) * 0.3;
      az += caz * 0.7 + (scratch[2] ?? 0) * 0.3;
    }
    ax += (gx0 - xi) * cohG;
    ay += (gy0 - yi) * cohG;
    az += (gz0 - zi) * cohG;

    // Soft walls: the sky's edges, the reeds below and the depth of the slab.
    if (xi < margin) ax += ((margin - xi) / margin) * 700;
    else if (xi > s.w - margin) ax -= ((xi - (s.w - margin)) / margin) * 700;
    if (yi < margin) ay += ((margin - yi) / margin) * 700;
    else if (yi > floor) {
      // A soft rise over the reeds — squared, so no hard line forms.
      const k = (yi - floor) / (s.h * 0.2);
      ay -= k * k * 1600 + k * 200;
    }
    if (zi > depth) az -= ((zi - depth) / depth) * 500;
    else if (zi < -depth) az += ((-depth - zi) / depth) * 500;

    let fright = Math.max(0, (f.fright[i] ?? 0) - dt / FRIGHT);
    if (scared * 0.82 > fright) {
      fright = scared * 0.82;
      f.onset[i] = t;
    }
    if (hawk) {
      const dx = xi - hawk.x;
      const dy = yi - hawk.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < hawkR) {
        const k = (1 - d / hawkR) * clamp01(p.scatter) * 2600;
        ax += (dx / d) * k;
        ay += (dy / d) * k;
        if (fright < 1) {
          fright = 1;
          f.onset[i] = t;
        }
      }
    }
    if (fright > 0.02) {
      // A startled bird jinks sideways: its turn is what darkens the wave.
      const sp = Math.hypot(vxi, vyi) || 1;
      const jk = (f.jink[i] ?? 1) * fright * 520 * clamp01(p.scatter + 0.3);
      ax += (-vyi / sp) * jk;
      ay += (vxi / sp) * jk;
    }
    f.fright[i] = fright;

    let vx = vxi + ax * dt;
    let vy = vyi + ay * dt;
    let vz = vzi + az * dt;
    const sp = Math.hypot(vx, vy, vz) || 1;
    const top = pace * (1.5 + fright * 0.5);
    const low = pace * 0.6;
    const k = sp > top ? top / sp : sp < low ? low / sp : 1;
    vx *= k;
    vy *= k;
    vz *= k;
    // Bank follows the turn: the share of the steering across the heading.
    const along = (ax * vx + ay * vy + az * vz) / (sp * sp);
    const lat = Math.hypot(ax - along * vx, ay - along * vy, az - along * vz);
    const bank = f.bank[i] ?? 0;
    f.bank[i] = bank + (clamp01(lat / 420) - bank) * Math.min(1, dt * 7);
    f.vx[i] = vx;
    f.vy[i] = vy;
    f.vz[i] = vz;
    f.x[i] = xi + vx * dt;
    f.y[i] = yi + vy * dt;
    f.z[i] = zi + vz * dt;
  }
}

type Inks = { bird: string; top: string; low: string; reeds: string };

function paintSky(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
  inks: Inks,
  sky: boolean,
  horizon: boolean,
  seed: number,
) {
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (sky) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, inks.top);
    g.addColorStop(0.55, inks.top);
    g.addColorStop(1, inks.low);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (!horizon) return;
  // The reed bed: a low bank and blades of seeded height, leaning a little
  // with the evening wind, a few with seed heads.
  const rand = lcg(seed * 31 + 5);
  const base = h * 0.93;
  ctx.fillStyle = inks.reeds;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    ctx.lineTo(
      x,
      base + Math.sin(x * 0.013 + seed) * 2 + Math.sin(x * 0.041) * 1.2,
    );
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = inks.reeds;
  ctx.lineCap = "round";
  const blades = Math.round(w / 3);
  for (let i = 0; i < blades; i += 1) {
    const x = rand() * w;
    const tall = (0.025 + rand() * rand() * 0.09) * h + 4;
    const lean = (rand() - 0.35) * tall * 0.35;
    ctx.lineWidth = 0.7 + rand() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, base + 2);
    ctx.quadraticCurveTo(
      x + lean * 0.2,
      base - tall * 0.6,
      x + lean,
      base - tall,
    );
    ctx.stroke();
    if (rand() < 0.08) {
      ctx.beginPath();
      ctx.ellipse(
        x + lean,
        base - tall - 2.5,
        1.4,
        3.2,
        lean / tall,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
}

function paintFlock(
  canvas: HTMLCanvasElement,
  s: Sim,
  dpr: number,
  ink: string,
  bird: number,
  marker: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { w, h } = s;
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const f = s.flock;
  const F = 2.2 * Math.max(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const size = clamp(bird, 0.6, 8);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  // Six batches: three widths (how broadside the wings show) by two depths.
  const widths = [0.7, 1.05, 1.5];
  for (let near = 0; near < 2; near += 1) {
    ctx.globalAlpha = near ? 1 : 0.68;
    for (let band = 0; band < 3; band += 1) {
      ctx.lineWidth = size * (widths[band] ?? 1) * (near ? 1.08 : 0.9);
      ctx.beginPath();
      for (let i = 0; i < f.n; i += 1) {
        const z = f.z[i] ?? 0;
        if ((z >= 0 ? 1 : 0) !== near) continue;
        const bank = f.bank[i] ?? 0;
        const b = bank < 0.28 ? 0 : bank < 0.62 ? 1 : 2;
        if (b !== band) continue;
        const k = F / (F - z);
        const sx = cx + ((f.x[i] ?? 0) - cx) * k;
        const sy = cy + ((f.y[i] ?? 0) - cy) * k;
        const vx = f.vx[i] ?? 0;
        const vy = f.vy[i] ?? 0;
        const vl = Math.hypot(vx, vy) || 1;
        const len = size * (0.5 + bank * 0.3) * k;
        const hx = (vx / vl) * len;
        const hy = (vy / vl) * len;
        ctx.moveTo(sx - hx, sy - hy);
        ctx.lineTo(sx + hx, sy + hy);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  const hawk = s.hawk;
  if (hawk) {
    // A falcon's silhouette along its path: pointed swept wings, a narrow
    // tail, banking into its turn.
    const a = Math.atan2(hawk.hy, hawk.hx);
    const span = clamp(size * 10, 12, 22);
    ctx.save();
    ctx.translate(hawk.x, hawk.y);
    ctx.rotate(a);
    ctx.scale(span / 20, span / 20);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.quadraticCurveTo(5, -1.4, 2, -1.6);
    ctx.quadraticCurveTo(-2, -5, -7, -10);
    ctx.quadraticCurveTo(-3.5, -4, -3, -1.4);
    ctx.lineTo(-9, -1.2);
    ctx.lineTo(-9, 1.2);
    ctx.lineTo(-3, 1.4);
    ctx.quadraticCurveTo(-3.5, 4, -7, 10);
    ctx.quadraticCurveTo(-2, 5, 2, 1.6);
    ctx.quadraticCurveTo(5, 1.4, 7, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (marker) {
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.lure.tx, s.lure.ty, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/**
 * A starling murmuration at dusk. Hundreds of birds fly a 3D flock —
 * cohesion, alignment and separation over a spatial hash — seen in
 * perspective, so when the flock turns in depth the cloud folds over itself,
 * and each bird reads darker as it banks, so waves of darkness roll through
 * it. The pointer is a lure: the flock is drawn to a ring around it and
 * carried round it about a slowly tilting axis, wheeling after the hand on
 * the drift spring's constants. A click sends a hawk through: birds near it
 * flee and jink, and the fright passes bird to bird with a reaction delay, so
 * an agitation wave runs out across the flock before it folds back together.
 *
 * The surface is a `role="application"`: focus shows the lure, Arrow keys move
 * it, Enter or Space sends a hawk, Escape lets the flock drift. Under reduced
 * motion the flock is one still frame flown from the seed, and a hawk re-poses
 * it with the hole it tore.
 */
export function Murmuration({
  count = 900,
  attraction = 0.5,
  speed = 1,
  cohesion = 0.5,
  alignment = 0.6,
  separation = 0.5,
  orbit = 64,
  bird = 1.6,
  scatter = 0.6,
  color = "var(--foreground)",
  sky = true,
  horizon = true,
  seed = 7,
  paused = false,
  interactive = true,
  dpr = 2,
  label = "Starling flock",
  onHawk,
  onLeadChange,
  children,
  className,
}: MurmurationProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const skyRef = React.useRef<HTMLCanvasElement | null>(null);
  const flockRef = React.useRef<HTMLCanvasElement | null>(null);
  const simRef = React.useRef<Sim | null>(null);
  const inksRef = React.useRef<Inks | null>(null);
  const loop = React.useRef({ raf: 0, last: 0, seen: false, draw: 0 });
  const leading = React.useRef(false);
  const api = React.useRef<{
    resize: () => void;
    wake: () => void;
    sleep: () => void;
    draw: () => void;
    still: () => void;
    skyPaint: () => void;
  } | null>(null);

  const cap = Math.min(2, Math.max(0.5, dpr));
  const live = motionSafe && !paused;
  const total = clamp(Math.round(count), 50, MAX);

  const getSim = () => {
    if (!simRef.current) {
      simRef.current = {
        flock: newFlock(),
        w: 0,
        h: 0,
        t: 0,
        lure: { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 },
        lead: { on: false, keyboard: false, touch: 0 },
        hawk: null,
        ready: false,
        p: {
          count: total,
          attraction,
          speed,
          cohesion,
          alignment,
          separation,
          orbit,
          scatter,
        },
      };
    }
    return simRef.current;
  };

  const readInks = () => {
    const skyNode = skyRef.current;
    const flockNode = flockRef.current;
    if (!skyNode || !flockNode) return null;
    const cs = getComputedStyle(skyNode);
    inksRef.current = {
      bird: getComputedStyle(flockNode).color,
      top: cs.color,
      low: cs.borderTopColor,
      reeds: cs.borderBottomColor,
    };
    return inksRef.current;
  };

  const skyPaint = () => {
    const s = getSim();
    const node = skyRef.current;
    if (!node || s.w < 2) return;
    const inks = inksRef.current ?? readInks();
    if (inks) paintSky(node, s.w, s.h, cap, inks, sky, horizon, seed);
  };

  const draw = () => {
    const s = getSim();
    const node = flockRef.current;
    if (!node || !s.ready) return;
    const inks = inksRef.current ?? readInks();
    if (!inks) return;
    paintFlock(node, s, cap, inks.bird, bird, s.lead.keyboard);
  };

  /** Reduced motion: the flock flown from its seed and caught mid-fold. */
  const still = () => {
    const s = getSim();
    if (s.w < 2) return;
    s.t = 0;
    s.hawk = null;
    s.flock.n = s.p.count;
    seedFlock(s, seed);
    for (let i = 0; i < 240; i += 1) fly(s, 1 / 60, true);
    s.ready = true;
    draw();
  };

  const frame = (dt: number) => {
    const s = getSim();
    if (!s.ready) return false;
    // Two half steps keep a fast flock from tunnelling through its walls.
    fly(s, dt / 2);
    fly(s, dt / 2);
    draw();
    return true;
  };
  const frameRef = React.useRef(frame);

  const sleep = () => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  };

  const wake = () => {
    const l = loop.current;
    if (!live) {
      sleep();
      if (!l.draw) {
        l.draw = window.requestAnimationFrame(() => {
          l.draw = 0;
          api.current?.draw();
        });
      }
      return;
    }
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(1 / 30, (now - l.last) / 1000) : 1 / 60;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (frameRef.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 2 || h < 2) return;
    const s = getSim();
    if (w === s.w && h === s.h && s.ready) return;
    const first = !s.ready;
    if (!first) {
      // Keep the flock where it was in the sky, scaled to the new box.
      const f = s.flock;
      const kx = w / s.w;
      const ky = h / s.h;
      for (let i = 0; i < f.n; i += 1) {
        f.x[i] = (f.x[i] ?? 0) * kx;
        f.y[i] = (f.y[i] ?? 0) * ky;
      }
      s.lure.x *= kx;
      s.lure.y *= ky;
      s.lure.tx *= kx;
      s.lure.ty *= ky;
    }
    s.w = w;
    s.h = h;
    rebuildHash(s);
    skyPaint();
    if (!motionSafe) {
      still();
      return;
    }
    if (first) {
      s.flock.n = s.p.count;
      seedFlock(s, seed);
      [s.lure.x, s.lure.y] = ambient(s, 0);
      // A few seconds flown before the first frame: it opens on a flock,
      // not on a scattered cloud.
      for (let i = 0; i < 90; i += 1) fly(s, 1 / 60);
      s.ready = true;
    }
    draw();
    wake();
  };

  React.useEffect(() => {
    frameRef.current = frame;
    api.current = { resize, wake, sleep, draw, still, skyPaint };
  });

  React.useEffect(() => {
    const s = getSim();
    s.p = {
      count: total,
      attraction,
      speed,
      cohesion,
      alignment,
      separation,
      orbit,
      scatter,
    };
    const f = s.flock;
    if (s.ready && total !== f.n) {
      const before = f.n;
      f.n = total;
      if (total > before) seedFlock(s, seed, before);
    }
    if (s.ready && !motionSafe) api.current?.still();
    else api.current?.wake();
    // getSim reads a ref only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    total,
    attraction,
    speed,
    cohesion,
    alignment,
    separation,
    orbit,
    scatter,
  ]);

  React.useEffect(() => {
    const s = getSim();
    if (s.w < 2) {
      api.current?.resize();
      return;
    }
    if (!motionSafe) api.current?.still();
    else {
      s.ready = false;
      api.current?.resize();
    }
    // A new seed or motion preference restarts the flock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, motionSafe]);

  React.useEffect(() => {
    inksRef.current = null;
    api.current?.skyPaint();
    api.current?.draw();
  }, [sky, horizon, seed, color, cap, bird]);

  React.useEffect(() => {
    if (paused) api.current?.sleep();
    else api.current?.wake();
  }, [paused]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.sleep();
      else api.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const l = loop.current;
    const s = getSim();
    return () => {
      if (l.raf) window.cancelAnimationFrame(l.raf);
      if (l.draw) window.cancelAnimationFrame(l.draw);
      l.raf = 0;
      l.draw = 0;
      window.clearTimeout(s.lead.touch);
    };
    // getSim reads a ref only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const l = loop.current;
    const sizer = new ResizeObserver(() => api.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      l.seen = Boolean(entry?.isIntersecting);
      if (l.seen) api.current?.wake();
      else api.current?.sleep();
    });
    watcher.observe(node);
    api.current?.resize();
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      l.seen = false;
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const setLeading = (on: boolean) => {
    if (leading.current === on) return;
    leading.current = on;
    onLeadChange?.(on);
  };

  const lead = (x: number, y: number) => {
    const s = getSim();
    s.lead.on = true;
    s.lure.tx = clamp(x, 0, s.w);
    s.lure.ty = clamp(y, 0, s.h);
    setLeading(true);
    if (!motionSafe) {
      s.lure.x = s.lure.tx;
      s.lure.y = s.lure.ty;
    }
  };

  const release = () => {
    const s = getSim();
    if (s.lead.keyboard) return;
    s.lead.on = false;
    setLeading(false);
  };

  const sendHawk = (x: number, y: number) => {
    const s = getSim();
    if (s.w < 2) return;
    onHawk?.();
    if (!motionSafe) {
      // Re-pose the still: the flock flown a moment with the hawk held at
      // the point, so the frame shows the hole it tore.
      s.hawk = {
        t: 0,
        x0: x,
        y0: y,
        x1: x,
        y1: y,
        x2: x,
        y2: y,
        x,
        y,
        hx: 1,
        hy: 0,
      };
      for (let i = 0; i < 40; i += 1) {
        if (s.hawk) s.hawk.t = 0;
        fly(s, 1 / 60, true);
      }
      s.hawk = null;
      draw();
      return;
    }
    if (paused) return;
    // In from the nearer side, through the point, out across the far side.
    const fromLeft = x < s.w / 2;
    const x0 = fromLeft ? -40 : s.w + 40;
    const x2 = fromLeft ? s.w + 40 : -40;
    const y0 = y - s.h * 0.3;
    const y2 = y + s.h * 0.12;
    s.hawk = {
      t: 0,
      x0,
      y0,
      x1: 2 * x - (x0 + x2) / 2,
      y1: 2 * y - (y0 + y2) / 2,
      x2,
      y2,
      x: x0,
      y: y0,
      hx: fromLeft ? 1 : -1,
      hy: 0,
    };
    wake();
  };

  const fromControl = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (!(target instanceof Element) || !root) return false;
    const hit = target.closest(CONTROLS);
    return Boolean(hit && root.contains(hit));
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !interactive,
    onStart: ({ point }) => {
      const at = local(point.x, point.y);
      if (at) lead(at.x, at.y);
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      if (at) lead(at.x, at.y);
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "touch") return;
      // A finger's lure lingers a moment after it lifts.
      const s = getSim();
      window.clearTimeout(s.lead.touch);
      s.lead.touch = window.setTimeout(release, 1200);
    },
    onCancel: () => release(),
    onTap: (event) => {
      if (fromControl(event.target)) return;
      const at = local(event.clientX, event.clientY);
      if (at) sendHawk(at.x, at.y);
    },
  });

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate aspect-[2/1] w-full overflow-clip",
        interactive && "touch-pan-y",
        className,
      )}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!interactive || event.pointerType === "touch") return;
        if (event.buttons !== 0) return;
        const at = local(event.clientX, event.clientY);
        if (at) lead(at.x, at.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        release();
      }}
    >
      <canvas
        ref={skyRef}
        aria-hidden
        onTransitionEnd={() => {
          inksRef.current = null;
          api.current?.skyPaint();
          api.current?.draw();
        }}
        className="pointer-events-none absolute inset-0 block size-full transition-colors duration-1"
        style={{
          color: SKY_TOP,
          borderTopColor: SKY_LOW,
          borderBottomColor: REEDS,
          background: sky
            ? `linear-gradient(180deg, ${SKY_TOP} 55%, ${SKY_LOW})`
            : undefined,
        }}
      />
      <canvas
        ref={flockRef}
        aria-hidden
        onTransitionEnd={() => {
          inksRef.current = null;
          api.current?.draw();
        }}
        className="pointer-events-none absolute inset-0 block size-full transition-colors duration-1"
        style={{ color }}
      />
      <div
        role="application"
        aria-roledescription="flock"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={!interactive || undefined}
        tabIndex={interactive ? 0 : -1}
        onFocus={(event) => {
          if (!interactive || !event.currentTarget.matches(":focus-visible")) {
            return;
          }
          const s = getSim();
          s.lead.keyboard = true;
          lead(s.lure.x || s.w / 2, s.lure.y || s.h * 0.4);
          wake();
        }}
        onBlur={() => {
          const s = getSim();
          s.lead.keyboard = false;
          release();
          draw();
        }}
        onKeyDown={(event) => {
          if (!interactive) return;
          const s = getSim();
          const step = (event.shiftKey ? 0.18 : 0.06) * Math.max(s.w, s.h);
          let { tx, ty } = s.lure;
          switch (event.key) {
            case "ArrowLeft":
              tx -= step;
              break;
            case "ArrowRight":
              tx += step;
              break;
            case "ArrowUp":
              ty -= step;
              break;
            case "ArrowDown":
              ty += step;
              break;
            case "Enter":
            case " ":
              event.preventDefault();
              if (!event.repeat) sendHawk(s.lure.tx, s.lure.ty);
              return;
            case "Escape":
              if (!s.lead.keyboard) return;
              event.preventDefault();
              s.lead.keyboard = false;
              release();
              draw();
              return;
            default:
              return;
          }
          event.preventDefault();
          s.lead.keyboard = true;
          lead(tx, ty);
          if (!motionSafe) still();
          else wake();
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      {children !== undefined && children !== null ? (
        <div className="relative h-full w-full">{children}</div>
      ) : null}
      <p id={hintId} className="sr-only">
        Arrow keys move a lure the flock wheels around, Shift for larger steps.
        Enter or Space sends a hawk through it; Escape lets the flock drift.
      </p>
    </div>
  );
}
