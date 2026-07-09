"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { springs } from "@/registry/lib/motion";

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** ζ≈0.64 — the reset swings past level once before settling. */
const REBALANCE = { type: "spring", stiffness: 120, damping: 14 } as const;

export type PointerTiltOptions = {
  /** Peak rotation toward the pointer, in degrees. */
  maxTilt?: number;
  /** Disable tracking (reduced motion, coarse pointers, energized states). */
  disabled?: boolean;
};

export type PointerTilt = {
  /** Sprung rotation, ready for a motion style: rotateX/rotateY in degrees. */
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  /** Sprung normalized pointer (-1..1) — parallax and lighting consumers. */
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
  /** Unsprung pointer position as 0..100% of the surface — glare hotspots. */
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  /** Spread onto the tracked element. */
  handlers: {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
  /** Swing back to level immediately (state changes, dismissals). */
  reset: () => void;
};

/**
 * Normalized pointer tracking mapped to sprung tilt — the house idiom for
 * pointer-driven perspective. The surface chases the pointer on the `glide`
 * spring and, when the pointer leaves, an underdamped rebalance swings it past
 * level once before it settles. Pair with `usePointerFine()` and
 * `useMotionSafe()` via `disabled`.
 */
export function usePointerTilt({
  maxTilt = 8,
  disabled = false,
}: PointerTiltOptions = {}): PointerTilt {
  const rectRef = React.useRef<DOMRect | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const tiltX = useSpring(targetX, GLIDE);
  const tiltY = useSpring(targetY, GLIDE);
  const rotateX = useTransform(tiltY, (v) => v * -maxTilt);
  const rotateY = useTransform(tiltX, (v) => v * maxTilt);
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);

  const stopControls = React.useCallback(() => {
    for (const controls of controlsRef.current) controls.stop();
    controlsRef.current = [];
  }, []);

  const reset = React.useCallback(() => {
    stopControls();
    controlsRef.current = [
      animate(targetX, 0, REBALANCE),
      animate(targetY, 0, REBALANCE),
    ];
  }, [stopControls, targetX, targetY]);

  // Level out whenever tracking turns off, and never leak springs on unmount.
  React.useEffect(() => {
    if (disabled) reset();
    return stopControls;
  }, [disabled, reset, stopControls]);

  const measure = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    rectRef.current = rect;
    return rect;
  };

  const handlers = React.useMemo<PointerTilt["handlers"]>(
    () => ({
      onPointerEnter: (event) => {
        if (disabled) return;
        measure(event.currentTarget);
        stopControls();
      },
      onPointerMove: (event) => {
        if (disabled) return;
        stopControls();
        const rect = rectRef.current ?? measure(event.currentTarget);
        if (rect.width === 0 || rect.height === 0) return;
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        targetX.set(Math.max(-1, Math.min(1, px * 2 - 1)));
        targetY.set(Math.max(-1, Math.min(1, py * 2 - 1)));
        pointerX.set(px * 100);
        pointerY.set(py * 100);
      },
      onPointerLeave: () => {
        if (disabled) return;
        reset();
      },
      onPointerCancel: () => {
        if (disabled) return;
        reset();
      },
    }),
    [disabled, reset, stopControls, targetX, targetY, pointerX, pointerY],
  );

  return {
    rotateX,
    rotateY,
    tiltX,
    tiltY,
    pointerX,
    pointerY,
    handlers,
    reset,
  };
}

const FINE_QUERY = "(pointer: fine)";

const subscribeToPointerFine = (onChange: () => void): (() => void) => {
  const media = window.matchMedia(FINE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

/**
 * True when a fine pointer (mouse, trackpad) is present. SSR-safe: false on
 * the server, so hover-tilt affordances never render before hydration.
 */
export function usePointerFine(): boolean {
  return React.useSyncExternalStore(
    subscribeToPointerFine,
    () => window.matchMedia(FINE_QUERY).matches,
    () => false,
  );
}
