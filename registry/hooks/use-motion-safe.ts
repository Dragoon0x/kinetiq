"use client";

import { createContext, useContext } from "react";

import { useReducedMotion } from "motion/react";

/**
 * Lets an app (or a docs page's "test reduced motion" switch) force the
 * reduced-motion pathway below any subtree, on top of the OS preference.
 */
export const ForceReducedMotionContext = createContext(false);

/**
 * Single source of truth for imperative motion decisions.
 * Returns true when rich motion may play; false when the component must
 * render its reduced-motion fallback. Declarative <motion.* /> transforms
 * are additionally governed by <MotionConfig reducedMotion>.
 */
export function useMotionSafe(): boolean {
  const osPrefersReduced = useReducedMotion();
  const forcedReduced = useContext(ForceReducedMotionContext);
  return !osPrefersReduced && !forcedReduced;
}
