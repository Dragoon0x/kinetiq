/**
 * The spring response drawn on every share card.
 *
 * Every Kinetiq animation runs on one of five springs, so the honest picture
 * of a component is not a screenshot but its physics: the curve a value takes
 * from rest to target on the spring that drives it. This integrates the same
 * damped oscillator the runtime does and hands back points for an SVG path,
 * so the card's curve is the real calibration, not an illustration of one.
 *
 * Pure and dependency-free: the OG routes run at build time, outside the
 * browser and outside React.
 */
import { springs, type SpringName } from "../registry/lib/motion";

export type SpringTrace = {
  name: SpringName;
  /** Damping ratio — the spring's personality, to two decimals. */
  zeta: number;
  /** The calibration itself, as motion.ts states it. */
  stiffness: number;
  damping: number;
  mass: number;
  /** Milliseconds until the value stays within 1% of the target. */
  settleMs: number;
  /** The path's `d`, in a box of `width` by `height`, drawn left to right. */
  path: string;
  /** Where the settle marker sits, in the same box. */
  settle: { x: number; y: number };
};

type Box = { width: number; height: number; windowMs: number };

/** Position samples for a unit step, one per millisecond. */
function integrate(name: SpringName, ms: number): number[] {
  const { stiffness, damping, mass } = springs[name];
  const dt = 0.001;
  let x = 0;
  let v = 0;
  const out: number[] = [0];
  for (let t = 1; t <= ms; t += 1) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    out.push(x);
  }
  return out;
}

export function dampingRatio(name: SpringName): number {
  const { stiffness, damping, mass } = springs[name];
  return damping / (2 * Math.sqrt(stiffness * mass));
}

/** First millisecond after which the value never leaves the 1% band. */
function settleTime(samples: number[]): number {
  let settled = samples.length - 1;
  for (let t = samples.length - 1; t >= 0; t -= 1) {
    if (Math.abs((samples[t] ?? 1) - 1) > 0.01) break;
    settled = t;
  }
  return settled;
}

/**
 * The trace for one spring, fitted to a box. Overshoot needs headroom, so
 * the vertical scale leaves a fifth of the height above the target line.
 */
export function springTrace(name: SpringName, box: Box): SpringTrace {
  const samples = integrate(name, box.windowMs);
  const settleMs = settleTime(samples);
  const top = box.height * 0.18;
  const bottom = box.height;
  const yOf = (value: number) => bottom - value * (bottom - top);
  const xOf = (t: number) => (t / box.windowMs) * box.width;

  const points: string[] = [];
  const step = Math.max(1, Math.round(box.windowMs / 240));
  for (let t = 0; t < samples.length; t += step) {
    points.push(`${xOf(t).toFixed(1)} ${yOf(samples[t] ?? 0).toFixed(1)}`);
  }
  const last = samples.length - 1;
  points.push(`${xOf(last).toFixed(1)} ${yOf(samples[last] ?? 1).toFixed(1)}`);

  const { stiffness, damping, mass } = springs[name];
  return {
    name,
    zeta: Math.round(dampingRatio(name) * 100) / 100,
    stiffness,
    damping,
    mass,
    settleMs,
    path: `M${points.join(" L")}`,
    settle: { x: xOf(settleMs), y: yOf(1) },
  };
}

/** The window that shows a spring's whole story without flattening it. */
export function windowFor(name: SpringName): number {
  const probe = integrate(name, 1200);
  const settle = settleTime(probe);
  return Math.min(1200, Math.max(360, Math.round(settle * 1.5)));
}

export const SPRING_NAMES = Object.keys(springs) as SpringName[];
