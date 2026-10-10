"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LetterRainTrigger =
  "press" | "hover" | "inView" | "mount" | "manual";
export type LetterRainElement = "p" | "h1" | "h2" | "h3" | "span" | "div";

export type LetterRainProps = {
  /** The line whose letters fall. */
  text: string;
  /** The element that carries the line for assistive technology. @default "p" */
  as?: LetterRainElement;
  /** Gravity, times 60 em/s² — so a caption and a hero fall alike. 0.25 to 2. @default 1 */
  gravity?: number;
  /** How much a landing bounces, 0 (a dead drop) to 1 (lively). @default 0.35 */
  bounce?: number;
  /** How much letters grip each other and the floor, 0 (ice) to 1 (felt). @default 0.5 */
  friction?: number;
  /** What drops the line: a press, the pointer arriving, coming into view, mounting, or only `fallen`. @default "press" */
  trigger?: LetterRainTrigger;
  /** Controlled: the letters are down (true) or on the line (false). */
  fallen?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultFallen?: boolean;
  /** Fires from the press, key or gesture that dropped or reassembled the line. */
  onFallenChange?: (fallen: boolean) => void;
  /** How far below the line the floor sits, em. @default 1.75 */
  depth?: number;
  /** Draw the floor the letters land on, as a hairline. @default true */
  floor?: boolean;
  /** Letters can be picked up and thrown. @default true */
  throwable?: boolean;
  /** Wait before an automatic drop (hover, in view, mount), ms. @default 0 */
  delay?: number;
  /** Between letters letting go of the line, ms; capped so the whole line goes inside 600ms. @default 28 */
  stagger?: number;
  /** Automatic triggers drop the line only once. @default false */
  once?: boolean;
  /** Reassemble on its own this long after the pile comes to rest, ms; 0 waits for a press. @default 0 */
  reassembleAfter?: number;
  /** The reassemble button's label. @default "Reassemble" */
  reassembleLabel?: string;
  /** The pile has come to rest, or the line has reassembled. */
  onComplete?: () => void;
  /** Play the landings the visitor causes. Off unless asked for. @default false */
  sound?: boolean;
  /** No dropping, throwing or reassembling. @default false */
  disabled?: boolean;
  className?: string;
};

/* ───────────────────────── physics ───────────────────────── */

type Body = {
  /** Slot: the ink box's centre on the line, px in the world box. */
  sx: number;
  sy: number;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  hw: number;
  hh: number;
  im: number;
  ii: number;
  /** Off the line and in the simulation. */
  free: boolean;
  held: boolean;
  asleep: boolean;
  /** Seconds spent slow enough to sleep. */
  still: number;
  /** Seconds since it left the line. */
  age: number;
  /** When it lets go of the line, s of simulation time; Infinity while standing. */
  release: number;
  /** Last landing heard, s. */
  heard: number;
};

type Contact = {
  /** Which pair and which corner or edge point: carries its impulse to the next step. */
  key: number;
  a: number;
  /** The other body, or -1 for a wall. */
  b: number;
  nx: number;
  ny: number;
  px: number;
  py: number;
  sep: number;
  jn: number;
  jt: number;
  mn: number;
  mt: number;
  bias: number;
  /** Approach speed at the start of the step, px/s (negative: closing). */
  vn0: number;
};

type World = {
  w: number;
  h: number;
  /** Font size, px: every threshold is in em. */
  em: number;
  g: number;
  e: number;
  mu: number;
  time: number;
  bodies: Body[];
  pool: Contact[];
  count: number;
  /** Last step's impulses by contact key: warm starting. */
  cache: Map<number, number>;
};

const STEP = 1 / 120;
const ITERATIONS = 10;
const SLOP = 0.5;
const BETA = 0.2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

const solid = (b: Body) => b.free && !b.held && !b.asleep;
const imOf = (b: Body | undefined) => (b && solid(b) ? b.im : 0);
const iiOf = (b: Body | undefined) => (b && solid(b) ? b.ii : 0);

function contact(world: World): Contact {
  let c = world.pool[world.count];
  if (!c) {
    c = {
      key: 0,
      a: 0,
      b: -1,
      nx: 0,
      ny: 0,
      px: 0,
      py: 0,
      sep: 0,
      jn: 0,
      jt: 0,
      mn: 0,
      mt: 0,
      bias: 0,
      vn0: 0,
    };
    world.pool.push(c);
  }
  world.count += 1;
  return c;
}

function push(
  world: World,
  a: number,
  b: number,
  feature: number,
  nx: number,
  ny: number,
  px: number,
  py: number,
  sep: number,
) {
  const c = contact(world);
  c.key = ((a * 1024 + (b + 1)) * 16 + feature) * 2;
  c.a = a;
  c.b = b;
  c.nx = nx;
  c.ny = ny;
  c.px = px;
  c.py = py;
  c.sep = sep;
  c.jn = 0;
  c.jt = 0;
}

/** A box against the four walls of the world: one contact per corner that touches. */
function wallContacts(world: World, i: number) {
  const b = world.bodies[i];
  if (!b) return;
  const c = Math.cos(b.a);
  const s = Math.sin(b.a);
  for (let k = 0; k < 4; k += 1) {
    const ux = (k === 0 || k === 3 ? -1 : 1) * b.hw;
    const uy = (k < 2 ? -1 : 1) * b.hh;
    const px = b.x + c * ux - s * uy;
    const py = b.y + s * ux + c * uy;
    const margin = SLOP * 2;
    const f = k * 4;
    if (world.h - py < margin) {
      push(world, i, -1, f, 0, 1, px, py, world.h - py);
    }
    if (py < margin) push(world, i, -1, f + 1, 0, -1, px, py, py);
    if (px < margin) push(world, i, -1, f + 2, -1, 0, px, py, px);
    if (world.w - px < margin) {
      push(world, i, -1, f + 3, 1, 0, px, py, world.w - px);
    }
  }
}

/** Letters keep this much air between them, em: ink to ink, they read as one blot. */
const SKIN = 0.04;

/**
 * Two boxes by separating axes: the face of least penetration is the
 * reference, the most opposed face of the other box is the incident edge, and
 * that edge clipped to the reference face's sides gives up to two contacts.
 * Both boxes wear a thin skin here (not against the walls), so resting
 * letters keep a hairline apart.
 */
function boxContacts(world: World, ia: number, ib: number) {
  const A = world.bodies[ia];
  const B = world.bodies[ib];
  if (!A || !B) return;
  const skin = world.em * SKIN;
  const aw = A.hw + skin;
  const ah = A.hh + skin;
  const bw = B.hw + skin;
  const bh = B.hh + skin;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const ca = Math.cos(A.a);
  const sa = Math.sin(A.a);
  const cb = Math.cos(B.a);
  const sb = Math.sin(B.a);
  const radius = (
    ux: number,
    uy: number,
    c: number,
    s: number,
    hw: number,
    hh: number,
  ) => hw * Math.abs(ux * c + uy * s) + hh * Math.abs(-ux * s + uy * c);
  // The four face normals: A's two axes, then B's.
  let best = -Infinity;
  let axis = -1;
  for (let k = 0; k < 4; k += 1) {
    const c = k < 2 ? ca : cb;
    const s = k < 2 ? sa : sb;
    const ux = k % 2 === 0 ? c : -s;
    const uy = k % 2 === 0 ? s : c;
    const sep =
      Math.abs(dx * ux + dy * uy) -
      radius(ux, uy, ca, sa, aw, ah) -
      radius(ux, uy, cb, sb, bw, bh);
    if (sep > 0) return;
    // A's faces win near-ties, so the reference face does not flicker.
    if (sep > best + (k < 2 ? 0 : 0.1)) {
      best = sep;
      axis = k;
    }
  }
  const refA = axis < 2;
  const R = refA ? A : B;
  const I = refA ? B : A;
  const rc = refA ? ca : cb;
  const rs = refA ? sa : sb;
  const rw = refA ? aw : bw;
  const rh = refA ? ah : bh;
  const iw = refA ? bw : aw;
  const ih = refA ? bh : ah;
  let nx = axis % 2 === 0 ? rc : -rs;
  let ny = axis % 2 === 0 ? rs : rc;
  const hN = axis % 2 === 0 ? rw : rh;
  const hS = axis % 2 === 0 ? rh : rw;
  if ((I.x - R.x) * nx + (I.y - R.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const sx = -ny;
  const sy = nx;
  // The incident face: the one of I's faces whose normal most opposes n.
  const ci = refA ? cb : ca;
  const si = refA ? sb : sa;
  const du = ci * nx + si * ny;
  const dv = -si * nx + ci * ny;
  let fx: number;
  let fy: number;
  let hf: number;
  let ex: number;
  let ey: number;
  let he: number;
  if (Math.abs(du) > Math.abs(dv)) {
    const sign = du > 0 ? -1 : 1;
    fx = ci * sign;
    fy = si * sign;
    hf = iw;
    ex = -si;
    ey = ci;
    he = ih;
  } else {
    const sign = dv > 0 ? -1 : 1;
    fx = -si * sign;
    fy = ci * sign;
    hf = ih;
    ex = ci;
    ey = si;
    he = iw;
  }
  const mx = I.x + fx * hf;
  const my = I.y + fy * hf;
  let x1 = mx + ex * he;
  let y1 = my + ey * he;
  let x2 = mx - ex * he;
  let y2 = my - ey * he;
  // Clip to the reference face's two sides.
  for (let side = 1; side >= -1; side -= 2) {
    const d1 = side * ((x1 - R.x) * sx + (y1 - R.y) * sy) - hS;
    const d2 = side * ((x2 - R.x) * sx + (y2 - R.y) * sy) - hS;
    if (d1 > 0 && d2 > 0) return;
    if (d1 > 0) {
      const t = d1 / (d1 - d2);
      x1 += (x2 - x1) * t;
      y1 += (y2 - y1) * t;
    } else if (d2 > 0) {
      const t = d2 / (d2 - d1);
      x2 += (x1 - x2) * t;
      y2 += (y1 - y2) * t;
    }
  }
  const onA = refA ? 1 : -1;
  const s1 = (x1 - R.x) * nx + (y1 - R.y) * ny - hN;
  if (s1 < SLOP * 2) {
    push(world, ia, ib, axis * 2, nx * onA, ny * onA, x1, y1, s1);
  }
  const s2 = (x2 - R.x) * nx + (y2 - R.y) * ny - hN;
  if (s2 < SLOP * 2) {
    push(world, ia, ib, axis * 2 + 1, nx * onA, ny * onA, x2, y2, s2);
  }
}

/** Relative velocity of B against A at a point, along a direction. */
function closing(
  A: Body,
  B: Body | undefined,
  px: number,
  py: number,
  dx: number,
  dy: number,
) {
  const rax = px - A.x;
  const ray = py - A.y;
  let vx = -(A.vx - A.w * ray);
  let vy = -(A.vy + A.w * rax);
  if (B) {
    const rbx = px - B.x;
    const rby = py - B.y;
    vx += B.vx - B.w * rby;
    vy += B.vy + B.w * rbx;
  }
  return vx * dx + vy * dy;
}

function impulse(
  A: Body,
  B: Body | undefined,
  px: number,
  py: number,
  jx: number,
  jy: number,
) {
  const ima = imOf(A);
  const iia = iiOf(A);
  A.vx -= ima * jx;
  A.vy -= ima * jy;
  A.w -= iia * ((px - A.x) * jy - (py - A.y) * jx);
  if (B) {
    const imb = imOf(B);
    const iib = iiOf(B);
    B.vx += imb * jx;
    B.vy += imb * jy;
    B.w += iib * ((px - B.x) * jy - (py - B.y) * jx);
  }
}

/**
 * One fixed step: gravity, contacts, ten passes of sequential impulses with
 * friction and restitution, then positions. A sleeping body is static to its
 * neighbours — that is what keeps a pile a pile — and wakes when struck hard.
 */
function stepWorld(
  world: World,
  onLand: (b: Body, speed: number) => void,
  dt = STEP,
) {
  const { bodies, em } = world;
  world.time += dt;
  for (const b of bodies) {
    if (!b.free && b.release <= world.time) {
      b.free = true;
      b.asleep = false;
      b.still = 0;
      b.age = 0;
    }
    if (!solid(b)) continue;
    b.age += dt;
    // Air barely slows a letter; a slow one, creeping on the pile, is
    // stopped by rolling resistance so the heap settles instead of shivering.
    const slow = Math.hypot(b.vx, b.vy) < em * 1.5;
    const air = Math.exp(-(slow ? 3 : 0.15) * dt);
    b.vx *= air;
    b.vy *= air;
    b.w *= Math.exp(-(slow ? 4 : 0.6) * dt);
    b.vy += world.g * dt;
  }
  world.count = 0;
  const n = bodies.length;
  for (let i = 0; i < n; i += 1) {
    const A = bodies[i];
    if (!A || !A.free || A.held) continue;
    if (!A.asleep) wallContacts(world, i);
    const ea = Math.abs(Math.cos(A.a)) * A.hw + Math.abs(Math.sin(A.a)) * A.hh;
    const fa = Math.abs(Math.sin(A.a)) * A.hw + Math.abs(Math.cos(A.a)) * A.hh;
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      const B = bodies[j];
      if (!B) continue;
      // Each free pair once; a standing or held letter is met from the free side.
      if (B.free && !B.held && j < i) continue;
      if (A.asleep && (!B.free || B.held || B.asleep)) continue;
      // A letter just off the line passes its old neighbours: kerned ink
      // overlaps, and would otherwise kick on release.
      if (!B.free && A.age < 0.3) continue;
      const eb =
        Math.abs(Math.cos(B.a)) * B.hw + Math.abs(Math.sin(B.a)) * B.hh;
      const fb =
        Math.abs(Math.sin(B.a)) * B.hw + Math.abs(Math.cos(B.a)) * B.hh;
      const reach = SLOP * 2 + em * SKIN * 2.9;
      if (Math.abs(A.x - B.x) > ea + eb + reach) continue;
      if (Math.abs(A.y - B.y) > fa + fb + reach) continue;
      boxContacts(world, i, j);
    }
  }
  // Pre-step: masses along the normal and tangent, the bias that pushes out
  // of overlap, and restitution from the approach speed.
  for (let k = 0; k < world.count; k += 1) {
    const c = world.pool[k];
    const A = c ? bodies[c.a] : undefined;
    if (!c || !A) continue;
    const B = c.b >= 0 ? bodies[c.b] : undefined;
    c.vn0 = closing(A, B, c.px, c.py, c.nx, c.ny);
    // A hard knock wakes a sleeper; a standing letter struck hard leaves the line.
    if (B && c.vn0 < -em * 3) {
      if (B.free && B.asleep && solid(A)) {
        B.asleep = false;
        B.still = 0;
      }
      if (!B.free && B.release === Infinity && c.vn0 < -em * 6) {
        // Knocked off the line: it leaves with some of the blow.
        B.release = world.time;
        B.vx = A.vx * 0.5;
        B.vy = A.vy * 0.5 - em;
        B.w = A.w * 0.5 + (A.vx > 0 ? 3 : -3);
        B.age = 0.3;
      }
      if (A.asleep && B.free && !B.asleep) {
        A.asleep = false;
        A.still = 0;
      }
    }
    const ima = imOf(A);
    const iia = iiOf(A);
    const imb = imOf(B);
    const iib = iiOf(B);
    const rax = c.px - A.x;
    const ray = c.py - A.y;
    const rbx = B ? c.px - B.x : 0;
    const rby = B ? c.py - B.y : 0;
    const rna = rax * c.ny - ray * c.nx;
    const rnb = rbx * c.ny - rby * c.nx;
    const kn = ima + imb + iia * rna * rna + iib * rnb * rnb;
    const tx = -c.ny;
    const ty = c.nx;
    const rta = rax * ty - ray * tx;
    const rtb = rbx * ty - rby * tx;
    const kt = ima + imb + iia * rta * rta + iib * rtb * rtb;
    c.mn = kn > 0 ? 1 / kn : 0;
    c.mt = kt > 0 ? 1 / kt : 0;
    const sink = (BETA / dt) * Math.max(0, -(c.sep + SLOP));
    const spring = c.vn0 < -em * 2.5 ? -world.e * c.vn0 : 0;
    c.bias = Math.max(sink, spring);
    // Warm start: last step's answer for this same contact, applied up
    // front, is what lets a stack hold still instead of shivering.
    const jn = world.cache.get(c.key);
    const jt = world.cache.get(c.key + 1);
    if (jn !== undefined && jt !== undefined) {
      c.jn = jn * 0.9;
      c.jt = jt * 0.9;
      impulse(
        A,
        B,
        c.px,
        c.py,
        c.jn * c.nx + c.jt * tx,
        c.jn * c.ny + c.jt * ty,
      );
    }
  }
  for (let it = 0; it < ITERATIONS; it += 1) {
    for (let k = 0; k < world.count; k += 1) {
      const c = world.pool[k];
      const A = c ? bodies[c.a] : undefined;
      if (!c || !A || c.mn === 0) continue;
      const B = c.b >= 0 ? bodies[c.b] : undefined;
      const vn = closing(A, B, c.px, c.py, c.nx, c.ny);
      let dn = c.mn * (-vn + c.bias);
      const jn = Math.max(c.jn + dn, 0);
      dn = jn - c.jn;
      c.jn = jn;
      impulse(A, B, c.px, c.py, dn * c.nx, dn * c.ny);
      const tx = -c.ny;
      const ty = c.nx;
      const vt = closing(A, B, c.px, c.py, tx, ty);
      let dt2 = c.mt * -vt;
      const cap = world.mu * c.jn;
      const jt = clamp(c.jt + dt2, -cap, cap);
      dt2 = jt - c.jt;
      c.jt = jt;
      impulse(A, B, c.px, c.py, dt2 * tx, dt2 * ty);
    }
  }
  world.cache.clear();
  for (let k = 0; k < world.count; k += 1) {
    const c = world.pool[k];
    if (!c) continue;
    world.cache.set(c.key, c.jn);
    world.cache.set(c.key + 1, c.jt);
  }
  // Landings heard: the first hard contact of a letter after a while apart.
  for (let k = 0; k < world.count; k += 1) {
    const c = world.pool[k];
    const A = c ? bodies[c.a] : undefined;
    if (!c || !A || !solid(A)) continue;
    if (c.vn0 < -em * 7 && world.time - A.heard > 0.14) {
      A.heard = world.time;
      onLand(A, -c.vn0);
    }
  }
  const cap = em * 40;
  for (const b of bodies) {
    if (!b.free || b.asleep) continue;
    if (b.held) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      continue;
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > cap) {
      b.vx *= cap / speed;
      b.vy *= cap / speed;
    }
    b.w = clamp(b.w, -30, 30);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.a += b.w * dt;
    if (speed < em * 0.25 && Math.abs(b.w) < 0.25) {
      b.still += dt;
      if (b.still > 0.4) {
        b.asleep = true;
        b.vx = 0;
        b.vy = 0;
        b.w = 0;
      }
    } else {
      b.still = 0;
    }
  }
}

/**
 * Time forward in steps no longer than 1/120 s, and short enough that nothing
 * travels more than an eighth of an em in one — so a thrown letter cannot
 * tunnel through a thin one.
 */
function advance(
  world: World,
  seconds: number,
  onLand: (b: Body, speed: number) => void,
) {
  let fastest = 0;
  for (const b of world.bodies) {
    if (!b.free || b.asleep) continue;
    fastest = Math.max(
      fastest,
      Math.hypot(b.vx, b.vy) + Math.abs(b.w) * Math.max(b.hw, b.hh),
    );
  }
  const reach = world.em * 0.12;
  const steps = Math.min(
    24,
    Math.max(Math.ceil(seconds / STEP), Math.ceil((fastest * seconds) / reach)),
  );
  for (let i = 0; i < steps; i += 1) stepWorld(world, onLand, seconds / steps);
}

const settled = (world: World) =>
  world.bodies.every((b) => !b.free || b.asleep) &&
  world.bodies.every((b) => b.release === Infinity || b.free);

/* ───────────────────────── component ───────────────────────── */

type Cell = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  opacity: MotionValue<number>;
  ox: MotionValue<string>;
  oy: MotionValue<string>;
};

type Phase = "standing" | "falling" | "fallen" | "assembling";

type Api = {
  drop: (x: number, y: number, byVisitor: boolean) => void;
  reassemble: (byVisitor: boolean) => void;
  measure: () => void;
  kick: () => void;
  halt: () => void;
  tick: (now: number) => void;
  reset: () => void;
};

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

/**
 * A line whose letters can fall off it. Each grapheme is a span in the line —
 * so the line keeps its box and its reading order — carrying x, y and rotate
 * relative to its slot. On the trigger the letters let go, nearest the press
 * first and cascade-staggered inside 600ms, each with a seeded pop and spin,
 * and fall as rigid boxes the size of their own ink (measured from the glyph,
 * so a resting letter touches the floor with ink, not with its line box):
 * they land on corners and topple, bounce by `bounce`, slide by `friction` and
 * pile at the foot of the box. The engine is small and real — separating-axis
 * contacts clipped to the reference face, sequential impulses with friction
 * and restitution at a fixed 120Hz, and sleep, a sleeping letter being static
 * to the rest so a pile stays put. A letter thrown hard at the line knocks
 * letters off it.
 *
 * Any letter can be picked up — even one still on the line — and it follows
 * the pointer 1:1 as an immovable body that shoves the pile, then leaves with
 * the release velocity and a spin from the throw. A tap hops a letter, or
 * knocks everything near it. Reassemble flies every letter home in reading
 * order: x on springs.glide, y on springs.snap (it lifts, then slides in),
 * rotation unwinding the short way on springs.snap, each starting from its own
 * velocity. The stage is a button: Enter drops the line or knocks the pile,
 * Left and Right shove it, Up tosses it, and the Reassemble button brings it
 * home. Under reduced motion nothing falls: the pile is simulated out of sight
 * and the letters cross-fade into it, and back.
 */
export function LetterRain({
  text,
  as: Tag = "p",
  gravity = 1,
  bounce = 0.35,
  friction = 0.5,
  trigger = "press",
  fallen,
  defaultFallen = false,
  onFallenChange,
  depth = 1.75,
  floor = true,
  throwable = true,
  delay = 0,
  stagger = 28,
  once = false,
  reassembleAfter = 0,
  reassembleLabel = "Reassemble",
  onComplete,
  sound = false,
  disabled = false,
  className,
}: LetterRainProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const running = onScreen && !hidden;

  const [own, setOwn] = React.useState(defaultFallen);
  const isFallen = fallen ?? own;
  const [phase, setPhase] = React.useState<Phase>("standing");
  const [holding, setHolding] = React.useState(false);
  const loose = phase !== "standing" && phase !== "assembling";

  const run = React.useMemo(() => {
    const chars = graphemes(text);
    return {
      chars,
      cells: chars.map((): Cell => ({
        x: motionValue(0),
        y: motionValue(0),
        rotate: motionValue(0),
        opacity: motionValue(1),
        ox: motionValue("50%"),
        oy: motionValue("50%"),
      })),
    };
  }, [text]);

  const worldRef = React.useRef<HTMLDivElement | null>(null);
  const stageRef = React.useRef<HTMLButtonElement | null>(null);
  const letters = React.useRef(new Map<number, HTMLSpanElement>());
  const marks = React.useRef(new Map<number, HTMLSpanElement>());
  const world = React.useRef<World>({
    w: 1,
    h: 1,
    em: 16,
    g: 960,
    e: 0.25,
    mu: 0.5,
    time: 0,
    bodies: [],
    pool: [],
    count: 0,
    cache: new Map(),
  });
  /** Body index per grapheme; -1 for spaces. */
  const index = React.useRef<number[]>([]);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const flights = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const grab = React.useRef<{
    body: number;
    lx: number;
    ly: number;
    tx: number;
    ty: number;
  } | null>(null);
  const press = React.useRef<{ x: number; y: number; body: number }>({
    x: 0,
    y: 0,
    body: -1,
  });
  /** The visitor caused what is moving: only then is a landing heard. */
  const audible = React.useRef(false);
  const dropped = React.useRef(false);
  const phaseRef = React.useRef<Phase>("standing");
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onComplete, onFallenChange });

  /** Every frame goes through the latest render's tick. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const stopFlights = () => {
    for (const f of flights.current) f.stop();
    flights.current = [];
  };

  /** Bodies to the screen: each letter's offset from its slot. */
  const paint = () => {
    const { bodies } = world.current;
    index.current.forEach((bi, i) => {
      const b = bodies[bi];
      const cell = run.cells[i];
      if (!b || !cell || bi < 0) return;
      cell.x.set(r2(b.x - b.sx));
      cell.y.set(r2(b.y - b.sy));
      cell.rotate.set(r2((b.a * 180) / Math.PI));
    });
  };

  const audibleNow = () =>
    audible.current &&
    (typeof navigator === "undefined" ||
      (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
        .userActivation?.hasBeenActive !== false);

  const land = (b: Body, speed: number) => {
    if (!audibleNow()) return;
    const ww = world.current;
    const size = clamp((b.hw + b.hh) / ww.em, 0.2, 1);
    audio.play("thud", {
      pitch: r2(1.35 - 0.5 * size),
      gain: r2(clamp(speed / (ww.em * 40), 0.12, 0.7)),
      pan: panFrom(
        (worldRef.current?.getBoundingClientRect().left ?? 0) + b.x,
        worldRef.current,
      ),
    });
  };

  /** The pile has come to rest: say so, and go home later if asked to. */
  const rested = () => {
    setPhaseBoth("fallen");
    report.current.onComplete?.();
    if (reassembleAfter > 0) {
      timers.current.push(
        window.setTimeout(() => {
          if (fallen === undefined) setOwn(false);
          report.current.onFallenChange?.(false);
          api.current?.reassemble(false);
        }, reassembleAfter),
      );
    }
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!running) {
      last.current = 0;
      return;
    }
    const ww = world.current;
    const elapsed = last.current
      ? Math.min(4 * STEP, (now - last.current) / 1000)
      : STEP;
    last.current = now;
    // Held letters are placed by the hand: their velocity is what carries
    // them to the pointer in one frame, so the pile feels the shove.
    const g = grab.current;
    const held = g ? ww.bodies[g.body] : undefined;
    if (g && held) {
      const span = Math.max(STEP, elapsed);
      held.vx = (g.tx - held.x) / span;
      held.vy = (g.ty - held.y) / span;
      held.w = 0;
    }
    advance(ww, elapsed, land);
    if (held) {
      held.vx = 0;
      held.vy = 0;
    }
    paint();
    if (!g && settled(ww)) {
      last.current = 0;
      api.current?.halt();
      if (phaseRef.current === "falling") rested();
      return;
    }
    frame.current = window.requestAnimationFrame(loop);
  };

  const kick = () => {
    if (frame.current || !running) return;
    last.current = 0;
    frame.current = window.requestAnimationFrame(loop);
  };

  const halt = () => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  const wakeAll = () => {
    for (const b of world.current.bodies) {
      if (!b.free) continue;
      b.asleep = false;
      b.still = 0;
    }
  };

  /** A letter fades out where it is, moves while unseen, and fades back in. */
  const crossfade = (cell: Cell, place: () => void, done?: () => void) => {
    const out = animate(cell.opacity, 0, {
      duration: durations.base,
      ease: easings.exit,
      onComplete: () => {
        place();
        flights.current.push(
          animate(cell.opacity, 1, {
            duration: durations.slow,
            ease: easings.enter,
            onComplete: done,
          }),
        );
      },
    });
    flights.current.push(out);
  };

  /**
   * Reduced motion: run the world to rest out of sight, then cross-fade every
   * letter that moved from where it was to where it came to lie.
   */
  const settleUnseen = () => {
    const ww = world.current;
    const before = ww.bodies.map((b) => [b.x, b.y, b.a] as const);
    for (let i = 0; i < 1200 && !settled(ww); i += 1) {
      advance(ww, STEP, () => {});
    }
    stopFlights();
    index.current.forEach((bi, i) => {
      const b = ww.bodies[bi];
      const was = before[bi];
      const cell = run.cells[i];
      if (!b || !cell || !was) return;
      if (
        Math.abs(was[0] - b.x) < 0.5 &&
        Math.abs(was[1] - b.y) < 0.5 &&
        Math.abs(was[2] - b.a) < 0.01 &&
        cell.opacity.get() > 0.99
      ) {
        return;
      }
      crossfade(cell, () => {
        cell.x.set(r2(b.x - b.sx));
        cell.y.set(r2(b.y - b.sy));
        cell.rotate.set(r2((b.a * 180) / Math.PI));
      });
    });
    if (audibleNow()) audio.play("thud", { pitch: 0.9, gain: 0.35 });
  };

  /** Let the line go, nearest a point first. */
  const drop = (x: number, y: number, byVisitor: boolean) => {
    const ww = world.current;
    if (!ww.bodies.length) return;
    clearTimers();
    stopFlights();
    dropped.current = true;
    audible.current = byVisitor;
    const standing = ww.bodies
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => !b.free && b.release === Infinity);
    if (!standing.length) return;
    standing.sort(
      (p, q) =>
        Math.hypot(p.b.sx - x, p.b.sy - y) - Math.hypot(q.b.sx - x, q.b.sy - y),
    );
    const gap = Math.min(Math.max(0, stagger) / 1000, cascade(standing.length));
    const rand = lcg(hash(text) ^ Math.round(x * 7 + y * 13));
    standing.forEach(({ b }, k) => {
      const awayX = b.sx - x;
      const away = Math.max(ww.em, Math.abs(awayX));
      b.release = ww.time + k * gap;
      b.x = b.sx;
      b.y = b.sy;
      b.a = 0;
      b.vx = ww.em * ((rand() - 0.5) * 3 + (awayX / away) * 1.6);
      b.vy = -ww.em * (2 + rand() * 3);
      b.w = (rand() - 0.5) * 7;
      b.heard = -1;
    });
    setPhaseBoth("falling");
    if (!motionSafe) {
      settleUnseen();
      rested();
      return;
    }
    kick();
  };

  /** Every letter home, in reading order. */
  const reassemble = (byVisitor: boolean) => {
    const ww = world.current;
    clearTimers();
    halt();
    stopFlights();
    grab.current = null;
    const order = index.current
      .map((bi, i) => ({ bi, i }))
      .filter(({ bi }) => bi >= 0);
    const gap = cascade(order.length);
    let left = order.length;
    setPhaseBoth("assembling");
    const home = () => {
      left -= 1;
      if (left > 0) return;
      for (const b of ww.bodies) {
        b.free = false;
        b.held = false;
        b.asleep = false;
        b.release = Infinity;
        b.x = b.sx;
        b.y = b.sy;
        b.a = 0;
        b.vx = 0;
        b.vy = 0;
        b.w = 0;
      }
      setPhaseBoth("standing");
      report.current.onComplete?.();
      if (byVisitor && audibleNow()) {
        audio.play("thud", { pitch: 1.7, gain: 0.22 });
      }
    };
    if (!order.length) {
      setPhaseBoth("standing");
      return;
    }
    order.forEach(({ bi, i }, k) => {
      const b = ww.bodies[bi];
      const cell = run.cells[i];
      if (!b || !cell) {
        home();
        return;
      }
      b.free = false;
      b.release = Infinity;
      // Never left the line: already home.
      if (
        Math.abs(cell.x.get()) < 0.5 &&
        Math.abs(cell.y.get()) < 0.5 &&
        Math.abs(cell.rotate.get()) < 0.5 &&
        cell.opacity.get() > 0.99
      ) {
        cell.x.jump(0);
        cell.y.jump(0);
        cell.rotate.jump(0);
        home();
        return;
      }
      if (!motionSafe) {
        crossfade(
          cell,
          () => {
            cell.x.set(0);
            cell.y.set(0);
            cell.rotate.set(0);
          },
          home,
        );
        return;
      }
      // The short way round: whole turns are invisible, so drop them first.
      const deg = cell.rotate.get();
      const wrapped = ((((deg + 180) % 360) + 360) % 360) - 180;
      cell.rotate.jump(r2(wrapped));
      const delayS = k * gap;
      const spin = clamp((b.w * 180) / Math.PI, -900, 900);
      flights.current.push(
        animate(cell.x, 0, { ...springs.glide, velocity: b.vx, delay: delayS }),
        animate(cell.y, 0, {
          ...springs.snap,
          velocity: b.vy,
          delay: delayS,
          onComplete: home,
        }),
        animate(cell.rotate, 0, {
          ...springs.snap,
          velocity: spin,
          delay: delayS,
        }),
        animate(cell.opacity, 1, { duration: durations.fast, delay: delayS }),
      );
    });
  };

  /** Where in the world box a client point is. */
  const local = (clientX: number, clientY: number) => {
    const box = worldRef.current;
    if (!box) return { x: 0, y: 0 };
    const r = box.getBoundingClientRect();
    return {
      x: clientX - r.left - box.clientLeft,
      y: clientY - r.top - box.clientTop,
    };
  };

  /** The letter under a point: the topmost free one, then the line. */
  const hit = (x: number, y: number) => {
    const ww = world.current;
    const pad = ww.em * 0.14;
    let found = -1;
    for (let i = ww.bodies.length - 1; i >= 0; i -= 1) {
      const b = ww.bodies[i];
      if (!b) continue;
      const bx = b.free ? b.x : b.sx;
      const by = b.free ? b.y : b.sy;
      const a = b.free ? b.a : 0;
      const c = Math.cos(-a);
      const s = Math.sin(-a);
      const lx = c * (x - bx) - s * (y - by);
      const ly = s * (x - bx) + c * (y - by);
      if (Math.abs(lx) <= b.hw + pad && Math.abs(ly) <= b.hh + pad) {
        if (b.free) return i;
        if (found < 0) found = i;
      }
    }
    return found;
  };

  const setFallen = (next: boolean) => {
    if (fallen === undefined) setOwn(next);
    report.current.onFallenChange?.(next);
  };

  /** A hop for one letter, or a knock that lifts everything near a point. */
  const knock = (x: number, y: number, body: number) => {
    const ww = world.current;
    audible.current = true;
    const rand = lcg(hash(text) ^ Math.round(x * 31 + y * 17 + ww.time * 1000));
    ww.bodies.forEach((b, i) => {
      if (!b.free || b.held) return;
      const d = Math.hypot(b.x - x, b.y - y) / ww.em;
      const near = i === body ? 1 : clamp01(1 - d / 4) * 0.8;
      if (near <= 0) return;
      b.asleep = false;
      b.still = 0;
      b.vy -= ww.em * (6 + rand() * 5) * near;
      b.vx +=
        ww.em * ((b.x - x) / Math.max(ww.em, Math.abs(b.x - x))) * 2 * near;
      b.w += (rand() - 0.5) * 14 * near;
    });
    setPhaseBoth("falling");
    if (!motionSafe) {
      settleUnseen();
      rested();
      return;
    }
    kick();
  };

  /** The keyboard's throw: the whole pile shoved one way, or tossed up. */
  const shove = (dir: "left" | "right" | "up") => {
    const ww = world.current;
    audible.current = true;
    const rand = lcg(hash(text) ^ Math.round(ww.time * 977));
    for (const b of ww.bodies) {
      if (!b.free || b.held) continue;
      b.asleep = false;
      b.still = 0;
      if (dir === "up") {
        b.vy -= ww.em * (12 + rand() * 6);
        b.w += (rand() - 0.5) * 12;
      } else {
        b.vx += ww.em * (dir === "left" ? -1 : 1) * (10 + rand() * 6);
        b.vy -= ww.em * (3 + rand() * 3);
        b.w += (dir === "left" ? -1 : 1) * (2 + rand() * 6);
      }
    }
    setPhaseBoth("falling");
    if (!motionSafe) {
      settleUnseen();
      rested();
      return;
    }
    kick();
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || !throwable,
    onStart: () => {
      const p = press.current;
      const ww = world.current;
      const b = ww.bodies[p.body];
      if (!b || phaseRef.current === "assembling") return;
      if (!b.free) {
        // Plucked off the line.
        b.free = true;
        b.release = ww.time;
        b.x = b.sx;
        b.y = b.sy;
        b.a = 0;
        b.age = 1;
        if (!loose) setFallen(true);
      }
      b.held = true;
      b.asleep = false;
      const c = Math.cos(-b.a);
      const s = Math.sin(-b.a);
      grab.current = {
        body: p.body,
        lx: c * (p.x - b.x) - s * (p.y - b.y),
        ly: s * (p.x - b.x) + c * (p.y - b.y),
        tx: b.x,
        ty: b.y,
      };
      audible.current = true;
      setHolding(true);
      setPhaseBoth("falling");
      if (motionSafe) {
        wakeAll();
        kick();
      }
    },
    onMove: ({ point }) => {
      const g = grab.current;
      const ww = world.current;
      const b = g ? ww.bodies[g.body] : undefined;
      if (!g || !b) return;
      const p = local(point.x, point.y);
      const c = Math.cos(b.a);
      const s = Math.sin(b.a);
      // The grabbed point stays under the finger; the box is kept inside the walls.
      const ex = Math.abs(c) * b.hw + Math.abs(s) * b.hh;
      const ey = Math.abs(s) * b.hw + Math.abs(c) * b.hh;
      g.tx = clamp(p.x - (c * g.lx - s * g.ly), ex, ww.w - ex);
      g.ty = clamp(p.y - (s * g.lx + c * g.ly), ey, ww.h - ey);
      if (!motionSafe) {
        // Direct manipulation still follows the hand under reduced motion.
        b.x = g.tx;
        b.y = g.ty;
        paint();
        return;
      }
      kick();
    },
    onEnd: ({ velocity }) => {
      const g = grab.current;
      const ww = world.current;
      const b = g ? ww.bodies[g.body] : undefined;
      grab.current = null;
      setHolding(false);
      if (!g || !b) return;
      b.held = false;
      const cap = ww.em * 30;
      b.vx = clamp(velocity.x, -cap, cap);
      b.vy = clamp(velocity.y, -cap, cap);
      // A throw spins the way it was thrown.
      b.w = clamp(b.vx / Math.max(ww.em, b.hw * 6), -10, 10);
      b.still = 0;
      wakeAll();
      if (!motionSafe) {
        b.vx = 0;
        b.vy = 0;
        b.w = 0;
        settleUnseen();
        rested();
        return;
      }
      kick();
    },
    onCancel: () => {
      const g = grab.current;
      const b = g ? world.current.bodies[g.body] : undefined;
      grab.current = null;
      setHolding(false);
      if (b) {
        b.held = false;
        b.vx = 0;
        b.vy = 0;
      }
      if (motionSafe) kick();
      else settleUnseen();
    },
    onTap: () => {
      if (disabled) return;
      const p = press.current;
      if (phaseRef.current === "assembling") return;
      if (phaseRef.current === "standing") {
        if (trigger === "manual") return;
        setFallen(true);
        api.current?.drop(p.x, p.y, true);
        return;
      }
      knock(p.x, p.y, world.current.bodies[p.body]?.free ? p.body : -1);
    },
  });

  /**
   * Slots and ink boxes from the line as laid out (offsets ignore the
   * transforms, so this can run with letters anywhere): each grapheme's
   * glyph is measured for its real ink, hung from its word's baseline.
   */
  const measure = () => {
    const box = worldRef.current;
    if (!box) return;
    const ww = world.current;
    ww.w = Math.max(1, box.clientWidth);
    ww.h = Math.max(1, box.clientHeight);
    const sample = letters.current.values().next().value;
    if (!sample) return;
    const style = getComputedStyle(sample);
    const fontPx = parseFloat(style.fontSize) || 16;
    ww.em = fontPx;
    ww.g = 60 * fontPx * clamp(gravity, 0.25, 2);
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const rebuild =
      ww.bodies.length !== run.chars.filter((c) => c.trim() !== "").length;
    const bodies: Body[] = rebuild ? [] : ww.bodies;
    const map: number[] = [];
    let word = 0;
    run.chars.forEach((ch, i) => {
      if (ch.trim() === "") {
        word += 1;
        map.push(-1);
        return;
      }
      const node = letters.current.get(i);
      const mark = marks.current.get(word);
      if (!node || !mark) {
        map.push(-1);
        return;
      }
      const m = ctx.measureText(ch);
      const baseline = mark.offsetTop;
      const left = node.offsetLeft;
      let l = left - m.actualBoundingBoxLeft;
      let r = left + m.actualBoundingBoxRight;
      let t = baseline - m.actualBoundingBoxAscent;
      let b = baseline + m.actualBoundingBoxDescent;
      if (!(r > l) || !(b > t)) {
        l = left;
        r = left + node.offsetWidth;
        t = baseline - fontPx * 0.5;
        b = baseline;
      }
      const inset = fontPx * 0.02;
      const hw = Math.max(fontPx * 0.08, (r - l) / 2 - inset);
      const hh = Math.max(fontPx * 0.08, (b - t) / 2 - inset);
      const sx = (l + r) / 2;
      const sy = (t + b) / 2;
      const cell = run.cells[i];
      cell?.ox.set(`${r2(sx - left)}px`);
      cell?.oy.set(`${r2(sy - node.offsetTop)}px`);
      const mass = (hw * hh * 4) / (fontPx * fontPx);
      const k = map.filter((v) => v >= 0).length;
      const prev = bodies[k];
      if (prev && !rebuild) {
        // Same letter, new layout: a standing letter moves with its slot.
        if (!prev.free) {
          prev.x = sx;
          prev.y = sy;
        }
        prev.sx = sx;
        prev.sy = sy;
        prev.hw = hw;
        prev.hh = hh;
        prev.im = 1 / mass;
        prev.ii = 12 / (mass * (4 * hw * hw + 4 * hh * hh));
      } else {
        bodies[k] = {
          sx,
          sy,
          x: sx,
          y: sy,
          a: 0,
          vx: 0,
          vy: 0,
          w: 0,
          hw,
          hh,
          im: 1 / mass,
          ii: 12 / (mass * (4 * hw * hw + 4 * hh * hh)),
          free: false,
          held: false,
          asleep: false,
          still: 0,
          age: 0,
          release: Infinity,
          heard: -1,
        };
      }
      map.push(k);
    });
    bodies.length = map.filter((v) => v >= 0).length;
    if (rebuild) ww.cache.clear();
    ww.bodies = bodies;
    index.current = map;
    const p = phaseRef.current;
    if (p === "falling" || p === "fallen") {
      // New walls: the pile finds its feet again, or under reduced motion is
      // simply kept inside them.
      if (motionSafe) {
        wakeAll();
        kick();
      } else {
        for (const b of bodies) {
          if (!b.free) continue;
          b.x = clamp(b.x, b.hw, ww.w - b.hw);
          b.y = clamp(b.y, b.hh, ww.h - b.hh);
        }
      }
      paint();
    }
  };

  React.useLayoutEffect(() => {
    api.current = {
      drop,
      reassemble,
      measure,
      kick,
      halt,
      tick,
      // A new line arrives standing, whatever the old one was doing.
      reset: () => {
        stopFlights();
        clearTimers();
        grab.current = null;
        setPhaseBoth("standing");
      },
    };
    report.current = { onComplete, onFallenChange };
    const ww = world.current;
    ww.g = 60 * ww.em * clamp(gravity, 0.25, 2);
    ww.e = clamp01(bounce) * 0.7;
    ww.mu = 0.1 + 0.8 * clamp01(friction);
  });

  // A new line starts standing.
  React.useLayoutEffect(() => {
    api.current?.halt();
    world.current.bodies = [];
    world.current.time = 0;
    api.current?.reset();
    api.current?.measure();
  }, [run]);

  React.useEffect(() => {
    if (running && phaseRef.current === "falling") api.current?.kick();
    if (!running) api.current?.halt();
  }, [running]);

  // A host that changes `fallen` gets the same fall or flight a press would.
  React.useEffect(() => {
    const p = phaseRef.current;
    if (isFallen && p === "standing") {
      const ww = world.current;
      api.current?.drop(ww.w / 2, 0, false);
    } else if (!isFallen && (p === "falling" || p === "fallen")) {
      api.current?.reassemble(false);
    }
  }, [isFallen]);

  // The automatic triggers. Each drops a standing line once per arrival, or
  // once ever with `once`.
  const [hovered, setHovered] = React.useState(false);
  const due =
    trigger === "mount"
      ? true
      : trigger === "inView"
        ? onScreen
        : trigger === "hover"
          ? hovered
          : false;
  React.useEffect(() => {
    if (!due || disabled) return;
    if (once && dropped.current) return;
    if (phaseRef.current !== "standing") return;
    const timer = window.setTimeout(
      () => {
        if (phaseRef.current !== "standing") return;
        const ww = world.current;
        report.current.onFallenChange?.(true);
        if (fallen === undefined) setOwn(true);
        // Silent: sound answers a press, a drag or a key, and a hover, a
        // scroll or a mount is none of those.
        api.current?.drop(ww.w / 2, 0, false);
      },
      Math.max(0, delay),
    );
    return () => window.clearTimeout(timer);
    // `fallen` only decides who holds the state; the trigger decides when.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, disabled, once, delay, trigger]);

  // Leaving view lets an in-view line drop again next time.
  React.useEffect(() => {
    if (trigger === "inView" && !onScreen && !once) dropped.current = false;
  }, [onScreen, once, trigger]);

  React.useEffect(() => {
    const t = timers;
    const f = flights;
    const loop = frame;
    return () => {
      for (const id of t.current) window.clearTimeout(id);
      t.current = [];
      for (const a of f.current) a.stop();
      f.current = [];
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
    };
  }, []);

  const bindWorld = React.useCallback((node: HTMLDivElement | null) => {
    worldRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindLetter = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(i, node);
    else letters.current.delete(i);
  };
  const bindMark = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) marks.current.set(i, node);
    else marks.current.delete(i);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !loose) return;
    const dir =
      event.key === "ArrowLeft"
        ? "left"
        : event.key === "ArrowRight"
          ? "right"
          : event.key === "ArrowUp"
            ? "up"
            : null;
    if (!dir) return;
    event.preventDefault();
    shove(dir);
  };

  // Words stay whole: the line wraps between them, never inside one. Each
  // word carries a zero-size mark on its baseline for the measure.
  const words: { at: number[]; key: number; n: number }[] = [];
  let current: number[] = [];
  run.chars.forEach((ch, i) => {
    if (ch.trim() === "") {
      if (current.length) words.push({ at: current, key: i, n: words.length });
      current = [];
      return;
    }
    current.push(i);
  });
  if (current.length)
    words.push({ at: current, key: run.chars.length, n: words.length });
  // The measure counts words by the spaces before each letter.
  const wordOf: number[] = [];
  {
    let k = 0;
    run.chars.forEach((ch) => {
      if (ch.trim() === "") k += 1;
      wordOf.push(k);
    });
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Tag className="sr-only">{text}</Tag>
      <div
        ref={bindWorld}
        aria-hidden
        className={cn(
          "relative overflow-clip select-none",
          floor ? "rounded-t-2 border-b border-hairline-strong" : "rounded-2",
        )}
        style={{ paddingBottom: `${Math.max(0, depth)}em` }}
      >
        {words.map((word, wi) => (
          <React.Fragment key={word.key}>
            {wi > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap">
              <span
                ref={bindMark(wordOf[word.at[0] ?? 0] ?? wi)}
                className="inline-block size-0 align-baseline"
              />
              {word.at.map((i) => {
                const cell = run.cells[i] as Cell;
                return (
                  <motion.span
                    key={i}
                    ref={bindLetter(i)}
                    className="inline-block"
                    style={{
                      x: cell.x,
                      y: cell.y,
                      rotate: cell.rotate,
                      opacity: cell.opacity,
                      originX: cell.ox,
                      originY: cell.oy,
                    }}
                  >
                    {run.chars[i]}
                  </motion.span>
                );
              })}
            </span>
          </React.Fragment>
        ))}
      </div>
      <button
        ref={stageRef}
        type="button"
        aria-label={loose ? "Knock the letters" : "Drop the letters"}
        aria-describedby={hintId}
        disabled={disabled}
        onPointerDown={(event) => {
          const p = local(event.clientX, event.clientY);
          press.current = { x: p.x, y: p.y, body: hit(p.x, p.y) };
          drag.onPointerDown(event);
        }}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
        onLostPointerCapture={drag.onLostPointerCapture}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Enter, Space, assistive technology — drops
          // the line from its middle, or knocks the pile.
          if (event.detail !== 0 || disabled) return;
          const ww = world.current;
          if (phaseRef.current === "standing") {
            if (trigger === "manual") return;
            setFallen(true);
            drop(ww.w / 2, 0, true);
          } else if (phaseRef.current !== "assembling") {
            knock(ww.w / 2, ww.h, -1);
          }
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 rounded-2 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-default"
            : holding
              ? "cursor-grabbing"
              : throwable && loose
                ? "cursor-grab"
                : "cursor-pointer",
          // Letters are dragged in any direction once loose.
          loose && throwable ? "touch-none" : "touch-pan-y",
        )}
      />
      {loose && !disabled ? (
        <motion.button
          type="button"
          initial={motionSafe ? { opacity: 0, y: -4 } : { opacity: 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
          onClick={(event) => {
            // Its own exit takes focus with it: hand it to the stage first.
            if (event.currentTarget === document.activeElement) {
              stageRef.current?.focus();
            }
            setFallen(false);
            reassemble(true);
          }}
          className="absolute top-1 right-1 inline-flex h-7 items-center rounded-2 border border-hairline bg-card/90 px-2.5 text-xs text-ink-2 shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)] backdrop-blur-sm transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {reassembleLabel}
        </motion.button>
      ) : null}
      <span id={hintId} className="sr-only">
        {loose
          ? "Enter knocks the letters, Left and Right shove them, Up tosses them. Reassemble puts them back."
          : "Press or Enter drops the letters off the line. Drag a letter to pick it up and throw it."}
      </span>
    </div>
  );
}
