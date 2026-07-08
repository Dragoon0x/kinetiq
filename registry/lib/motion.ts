import type { Transition } from "motion/react";

/**
 * The Kinetiq calibration set. Every component draws its physics from these
 * five springs — flick confirms, snap switches, glide moves, drift breathes,
 * recoil celebrates — so compositions share one motion language.
 *
 * ζ (damping ratio) is each spring's personality: 1 settles without
 * overshoot, below 1 overshoots, well below 1 visibly bounces.
 */
export const springs = {
  /** ζ 0.99 · settles ~120ms. Press states, tick draws, focus. */
  flick: { type: "spring", stiffness: 1100, damping: 55, mass: 0.7 },
  /** ζ 0.83 · settles ~300ms. Toggles, tab indicators, menus — one crisp overshoot. */
  snap: { type: "spring", stiffness: 640, damping: 42, mass: 1.0 },
  /** ζ 0.98 · settles ~450ms. Layout shifts, reorders, morphs. */
  glide: { type: "spring", stiffness: 300, damping: 34, mass: 1.0 },
  /** ζ 1.00 · settles ~800ms. Large surfaces, ambient drift, parallax settle. */
  drift: { type: "spring", stiffness: 120, damping: 24, mass: 1.2 },
  /** ζ 0.53 · settles ~700ms. Toasts, stamps, landings — two visible bounces. */
  recoil: { type: "spring", stiffness: 520, damping: 24, mass: 1.0 },
} as const satisfies Record<string, Transition>;

export type SpringName = keyof typeof springs;

/** Tweens cover properties without physical meaning: opacity, color, blur, clip. */
export const durations = {
  blink: 0.08,
  fast: 0.15,
  base: 0.24,
  slow: 0.4,
  page: 0.7,
} as const;

export const easings = {
  /** Fast arrival, soft landing. */
  enter: [0.22, 1, 0.36, 1],
  /** Accelerates away — exits never spring. */
  exit: [0.5, 0, 0.75, 0],
  /** Symmetric moves. */
  move: [0.65, 0, 0.35, 1],
  /** Marquees and scroll-linked values only. */
  linear: [0, 0, 1, 1],
} as const;

/** Enter offsets: elements arrive from 4–16px away, never long slides. */
export const distances = {
  nudge: 4,
  step: 8,
  shift: 16,
} as const;

/**
 * Stagger interval under the 600ms choreography budget — dense lists
 * tighten automatically so a cascade never reads as lag.
 */
export const cascade = (count: number): number =>
  Math.min(0.06, Math.max(0.02, 0.6 / Math.max(count - 1, 1)));

/** Exits run at 0.6× their enter duration, easing out of the scene. */
export const exitFor = (enterDuration: number = durations.base): Transition => ({
  duration: enterDuration * 0.6,
  ease: easings.exit,
});

/**
 * Picks the reduced-motion-safe transition. Pair with useMotionSafe():
 *   transition={safe(springs.snap)(motionSafe)}
 */
export const safe =
  (
    full: Transition,
    reduced: Transition = { duration: durations.fast },
  ): ((motionSafe: boolean) => Transition) =>
  (motionSafe) =>
    motionSafe ? full : reduced;
