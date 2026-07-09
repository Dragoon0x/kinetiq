"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** `springs.drift`, shaped as a bare `useSpring` smoothing config. */
const DRIFT_SMOOTHING = {
  stiffness: springs.drift.stiffness,
  damping: springs.drift.damping,
  mass: springs.drift.mass,
} as const;

/** `springs.glide`, shaped for the target's lean toward the pointer. */
const LEAN_SMOOTHING = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/**
 * Reads `(pointer:fine)` as an external store — no setState-in-effect, SSR-safe.
 * Coarse pointers (touch) and the server both resolve to `false`, so the
 * enhancement stays inert until a real mouse proves itself on the client.
 */
function subscribeFine(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia("(pointer:fine)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getFineSnapshot(): boolean {
  return window.matchMedia("(pointer:fine)").matches;
}

function getFineServerSnapshot(): boolean {
  return false;
}

/** True only on devices whose primary pointer is fine (a mouse-like cursor). */
function usePointerFine(): boolean {
  return React.useSyncExternalStore(
    subscribeFine,
    getFineSnapshot,
    getFineServerSnapshot,
  );
}

export type MagneticCursorProps = {
  children: React.ReactNode;
  className?: string;
  /** Spotlight diameter in px. @default 28 */
  size?: number;
};

/**
 * A pointer enhancement layer for fine-pointer devices. Renders its children
 * plus a soft, fixed-position spotlight that trails the real cursor on a
 * `drift`-lagged spring — the OS cursor is never hidden; the glow augments it.
 * The spotlight fades in on the first move and out when the pointer leaves the
 * window. On coarse pointers (touch) or under reduced motion the layer is
 * inert: children render in a plain wrapper with no follower at all.
 */
export function MagneticCursor({
  children,
  className,
  size = 28,
}: MagneticCursorProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const fine = usePointerFine();
  const active = fine && motionSafe;

  // Raw pointer position in viewport coords; the spring makes the glow lag.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, DRIFT_SMOOTHING);
  const y = useSpring(pointerY, DRIFT_SMOOTHING);
  const opacity = useMotionValue(0);

  const fadeControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const fadeTo = React.useCallback(
    (value: number) => {
      fadeControls.current?.stop();
      fadeControls.current = animate(opacity, value, {
        duration: durations.base,
      });
    },
    [opacity],
  );

  React.useEffect(() => {
    if (!active) return;

    let entered = false;
    const handleMove = (event: PointerEvent) => {
      if (!entered) {
        // Snap to the pointer on first sight so the glow doesn't slide in
        // from the top-left origin, then let the spring lag from here on.
        entered = true;
        x.jump(event.clientX);
        y.jump(event.clientY);
        fadeTo(1);
      }
      pointerX.set(event.clientX);
      pointerY.set(event.clientY);
    };
    const handleLeave = (event: PointerEvent) => {
      // relatedTarget null means the pointer left the document, not an element.
      if (event.relatedTarget === null) fadeTo(0);
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    document.addEventListener("pointerout", handleLeave);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerout", handleLeave);
      fadeControls.current?.stop();
      fadeControls.current = null;
      opacity.set(0);
    };
  }, [active, pointerX, pointerY, x, y, opacity, fadeTo]);

  if (!active) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-0 left-0 z-50 rounded-full blur-[6px]"
        style={{
          x,
          y,
          opacity,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          background:
            "radial-gradient(circle, var(--signal) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

export type MagneticTargetProps = {
  children: React.ReactNode;
  /** Fraction of the pointer offset the target follows (0..1). @default 0.35 */
  strength?: number;
  /** Activation radius in px around the target's center. @default 90 */
  radius?: number;
  className?: string;
};

/**
 * Wraps a real control so it leans toward the pointer when the cursor comes
 * within `radius`, then springs home on `glide` when it leaves. The lean is
 * `offset × strength`, eased by a cosine falloff toward the edge of the field.
 * The wrapper is a transparent transform layer — no role, no tabIndex — so the
 * child stays fully focusable and clickable. Inert (renders the child in a
 * plain inline-block span) on coarse pointers or under reduced motion.
 */
export function MagneticTarget({
  children,
  strength = 0.35,
  radius = 90,
  className,
}: MagneticTargetProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const fine = usePointerFine();
  const active = fine && motionSafe;

  const ref = React.useRef<HTMLSpanElement | null>(null);
  const centerRef = React.useRef<{ x: number; y: number } | null>(null);

  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const x = useSpring(offsetX, LEAN_SMOOTHING);
  const y = useSpring(offsetY, LEAN_SMOOTHING);

  React.useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const rect = node.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };
    measure();

    const handleMove = (event: PointerEvent) => {
      const center = centerRef.current;
      if (!center) return;
      const dx = event.clientX - center.x;
      const dy = event.clientY - center.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= radius) {
        offsetX.set(0);
        offsetY.set(0);
        return;
      }
      // Cosine falloff: full pull at the center, easing to none at the edge.
      const falloff = (1 + Math.cos((distance / radius) * Math.PI)) / 2;
      const pull = strength * falloff;
      offsetX.set(dx * pull);
      offsetY.set(dy * pull);
    };

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(node);

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      observer?.disconnect();
      // Release any residual lean so a later inert render starts centered.
      offsetX.set(0);
      offsetY.set(0);
    };
  }, [active, strength, radius, offsetX, offsetY]);

  if (!active) {
    return <span className={cn("inline-block", className)}>{children}</span>;
  }

  return (
    <motion.span
      ref={ref}
      className={cn("inline-block", className)}
      style={{ x, y }}
    >
      {children}
    </motion.span>
  );
}
