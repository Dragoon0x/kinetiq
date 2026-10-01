import { easings, springs, type SpringName } from "@/registry/lib/motion";

/**
 * The film moves by Kinetiq's own calibration set. Every camera move, mask
 * and type entrance below is the closed-form solution of one of the five
 * springs in registry/lib/motion.ts — the same stiffness, damping and mass
 * the components ship with — evaluated at a film time instead of stepped by
 * a frame loop, so any frame can be computed on its own.
 */
export type Spring = { stiffness: number; damping: number; mass: number };

export const SPRING: Record<SpringName, Spring> = springs;

/**
 * Position of a spring released from 0 toward 1 (with an optional initial
 * velocity in units per second), `t` seconds after release. Before release
 * it is 0. Overshooting springs pass 1 and come back, as they do on screen.
 */
export function springAt(spring: Spring, t: number, velocity = 0): number {
  if (t <= 0) return 0;
  const { stiffness: k, damping: c, mass: m } = spring;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  // y = x - 1 starts at -1 with the given velocity and decays to 0.
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const a = -1;
    const b = (velocity + zeta * w0 * a) / wd;
    const y =
      Math.exp(-zeta * w0 * t) * (a * Math.cos(wd * t) + b * Math.sin(wd * t));
    return 1 + y;
  }
  if (zeta === 1) {
    const a = -1;
    const b = velocity + w0 * a;
    return 1 + (a + b * t) * Math.exp(-w0 * t);
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - root);
  const r2 = -w0 * (zeta + root);
  const c2 = (velocity + r1) / (r2 - r1);
  const c1 = -1 - c2;
  return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
}

/** The named spring from the calibration set, released at `start`. */
export const spring = (name: SpringName, t: number, start = 0): number =>
  springAt(SPRING[name], t - start);

/**
 * When a spring has settled: the first moment after which it stays within
 * `tolerance` of its target. Used to time the sound of an arrival to the
 * frame it lands on, and to print each calibration's measured settle time.
 */
export function settleTime(spring: Spring, tolerance = 0.005): number {
  let last = 0;
  for (let t = 0; t < 4; t += 1 / 1200) {
    if (Math.abs(springAt(spring, t) - 1) > tolerance) last = t;
  }
  return last;
}

/** The first moment a spring reaches its target (its first arrival). */
export function arrivalTime(spring: Spring, threshold = 0.985): number {
  for (let t = 0; t < 4; t += 1 / 1200) {
    if (springAt(spring, t) >= threshold) return t;
  }
  return 4;
}

/** A cubic-bezier easing, solved for x by Newton's method. */
export function bezier(
  [x1, y1, x2, y2]:
    readonly [number, number, number, number] | readonly number[],
  x: number,
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * (x1 ?? 0);
  const bx = 3 * ((x2 ?? 1) - (x1 ?? 0)) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * (y1 ?? 0);
  const by = 3 * ((y2 ?? 1) - (y1 ?? 0)) - cy;
  const ay = 1 - cy - by;
  let u = x;
  for (let i = 0; i < 8; i++) {
    const fx = ((ax * u + bx) * u + cx) * u - x;
    const d = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(fx) < 1e-6 || d === 0) break;
    u -= fx / d;
  }
  return ((ay * u + by) * u + cy) * u;
}

/** The calibration set's tweens: enter, exit, move — as in the library. */
export const ease = {
  enter: (x: number) => bezier(easings.enter, x),
  exit: (x: number) => bezier(easings.exit, x),
  move: (x: number) => bezier(easings.move, x),
};

/** Progress of `t` through [from, to], clamped to 0..1. */
export const span = (t: number, from: number, to: number): number =>
  to === from
    ? t >= to
      ? 1
      : 0
    : Math.min(1, Math.max(0, (t - from) / (to - from)));

export const mix = (a: number, b: number, p: number): number => a + (b - a) * p;

/** Rounded to a hundredth, the way the library rounds every per-frame number. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;
