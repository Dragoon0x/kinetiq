/**
 * The spatial set — Kinetiq's shared geometry vocabulary. Every spatial
 * instrument draws its perspective, detents, lift shadows, orbits, and
 * deterministic seeding from here so depth reads consistently across the wing.
 * Pure math: no DOM, no React.
 */

/**
 * House perspective range, in px. Shallow chrome sits near, full scenes far;
 * staying inside the range keeps depth cues consistent between instruments.
 */
export const perspectives = {
  near: 700,
  base: 800,
  far: 900,
} as const;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Linear remap of `value` from [inMin, inMax] to [outMin, outMax], clamped. */
export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  if (inMin === inMax) return outMin;
  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
};

/** Normalize any angle to [0, 360). */
export const wrapAngle = (deg: number): number => ((deg % 360) + 360) % 360;

/** Shortest signed distance from one angle to another, in (-180, 180]. */
export const angleDelta = (from: number, to: number): number => {
  const diff = wrapAngle(to - from);
  return diff > 180 ? diff - 360 : diff;
};

/** The nearest detent to a free angle given a detent step (90 for a cube). */
export const snapAngle = (deg: number, step: number): number =>
  Math.round(deg / step) * step;

export type LiftShadow = {
  /** Vertical shadow offset, px. */
  y: number;
  /** Shadow blur radius, px. */
  blur: number;
  /** Shadow spread, px (negative — lifted shadows contract). */
  spread: number;
  /** Shadow opacity, 0..1. */
  opacity: number;
  /** Scale of the lifted element itself. */
  scale: number;
};

/**
 * Contact-shadow tokens for an element lifted `altitude` (0 grounded .. 1 at
 * full lift) off its surface. Higher means a longer, softer, fainter shadow
 * and a slightly larger element — the physical cue that sells levitation.
 */
export const liftShadow = (altitude: number): LiftShadow => {
  const a = clamp(altitude, 0, 1);
  return {
    y: 2 + a * 16,
    blur: 4 + a * 28,
    spread: -2 - a * 6,
    opacity: 0.28 - a * 0.16,
    scale: 1 + a * 0.04,
  };
};

/** `liftShadow` composed into a box-shadow declaration. */
export const liftShadowCss = (
  altitude: number,
  color = "oklch(0.05 0.02 258)",
): string => {
  const s = liftShadow(altitude);
  return `0 ${s.y}px ${s.blur}px ${s.spread}px color-mix(in oklab, ${color} ${Math.round(
    s.opacity * 100,
  )}%, transparent)`;
};

export type OrbitPoint = {
  x: number;
  y: number;
  z: number;
  /** z normalized to [-1, 1]: -1 farthest, 1 nearest. */
  depth: number;
};

/**
 * A point on a circular orbit of `radius`, at `angleDeg`, inclined toward the
 * viewer by `inclineDeg` (0 = edge-on ellipse collapsed to a line, 90 = a flat
 * ring facing the viewer). Feed x/y to translate, and depth to scale/z-order.
 */
export const orbitPoint = (
  radius: number,
  angleDeg: number,
  inclineDeg = 24,
): OrbitPoint => {
  const a = (angleDeg * Math.PI) / 180;
  const incline = (inclineDeg * Math.PI) / 180;
  const x = Math.cos(a) * radius;
  const z = Math.sin(a) * radius;
  return {
    x,
    y: -z * Math.sin(incline),
    z: z * Math.cos(incline),
    depth: radius === 0 ? 0 : Math.sin(a),
  };
};

/** djb2 string hash — the house source of deterministic per-instance variety. */
export const djb2 = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
};

/**
 * Seeded PRNG (mulberry32): stable sequences from a djb2 seed, so generated
 * scenes render identically on server, client, and every revisit.
 */
export const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
