"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * Lets an app (or a docs page's "test reduced motion" switch) force the
 * reduced-motion pathway below any subtree, on top of the OS preference.
 */
export const ForceReducedMotionContext = createContext(false);

const QUERY = "(prefers-reduced-motion: reduce)";

const canMatch = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

const subscribe = (onStoreChange: () => void): (() => void) => {
  if (!canMatch()) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
};

const getSnapshot = (): boolean => canMatch() && window.matchMedia(QUERY).matches;

/**
 * A prerender has no media query to read, so it always reports "not reduced".
 * React uses this same snapshot for the hydration pass, which is the point:
 * the first client render must produce the markup the server actually sent.
 * Reading the real preference during that render instead — which is what
 * motion's own useReducedMotion does — makes every component that branches on
 * it hydrate against mismatched HTML for exactly the viewers who asked for
 * less motion. React then re-renders with the true value once hydration lands.
 */
const getServerSnapshot = (): boolean => false;

/**
 * Single source of truth for imperative motion decisions.
 * Returns true when rich motion may play; false when the component must
 * render its reduced-motion fallback. Declarative <motion.* /> transforms
 * are additionally governed by <MotionConfig reducedMotion>.
 *
 * Subscribing (rather than sampling once) also means toggling the OS setting
 * updates a live page instead of waiting for a reload.
 */
export function useMotionSafe(): boolean {
  const osPrefersReduced = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const forcedReduced = useContext(ForceReducedMotionContext);
  return !osPrefersReduced && !forcedReduced;
}
