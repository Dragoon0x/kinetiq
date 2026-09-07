"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** The props this wrapper reads off the button it is given. */
type Surface = React.ReactElement<
  React.HTMLAttributes<HTMLElement> & { disabled?: boolean }
>;

export type TapRippleProps = {
  /** Ripple colour; defaults to `currentColor` at 16%. */
  color?: string;
  /** Expansion in milliseconds. @default 400 */
  duration?: number;
  /** The button. Its semantics, handlers and classes are left alone. */
  children: Surface;
};

/** currentColor is only borrowed, so it is laid on thin enough to read as ink. */
const TINT_ALPHA = 0.16;

/** A mashed button should not grow an unbounded pile of discs. */
const MAX_RIPPLES = 6;

type Ripple = {
  id: number;
  x: number;
  y: number;
  size: number;
  released: boolean;
};

/**
 * A press ripple that starts where the press did. On pointerdown a disc is
 * placed under the finger and expands on a tween — a ripple is a spreading
 * front, not a landing, so it never springs — sized from the press point to the
 * furthest corner so it always covers the surface, and it fades on the exit ease
 * when the press is let go. Presses overlap: each disc is its own animation and
 * clears itself once its fade is over.
 *
 * The wrapper clones the button rather than boxing it, so the role, label,
 * disabled state, handlers and classes are exactly what the caller wrote; all it
 * adds is a positioning class and a clipping layer that inherits the button's
 * own radius, which is `aria-hidden` and takes no pointer events. Enter and
 * Space ripple from the centre, because a keyboard press has no point to start
 * from. Under reduced motion nothing travels: the surface takes a brief wash
 * and lets it go.
 */
export function TapRipple({
  color,
  duration = durations.slow * 1000,
  children,
}: TapRippleProps) {
  const motionSafe = useMotionSafe();
  const [ripples, setRipples] = React.useState<Ripple[]>([]);

  // A sweep rather than an animation callback: a tab in the background gets no
  // frames, and a ripple that never finished animating must still be collected.
  React.useEffect(() => {
    if (!ripples.some((ripple) => ripple.released)) return;
    const timer = window.setTimeout(
      () => setRipples((prev) => prev.filter((ripple) => !ripple.released)),
      duration + durations.base * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [ripples, duration]);

  const spawn = (host: HTMLElement, point: { x: number; y: number } | null) => {
    const rect = host.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = point ? point.x - rect.left : rect.width / 2;
    const y = point ? point.y - rect.top : rect.height / 2;
    // Reach the furthest corner, then double it: the disc is centred on the
    // press, so its radius is what has to clear the corner.
    const size =
      2 *
      Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y),
      );
    setRipples((prev) => {
      // Ids come from the list itself rather than a counter ref: discs are only
      // ever appended, so the last one always holds the highest number.
      const newest = prev[prev.length - 1];
      const id = (newest ? newest.id : 0) + 1;
      return [...prev, { id, x, y, size, released: false }].slice(-MAX_RIPPLES);
    });
  };

  const release = () =>
    setRipples((prev) =>
      prev.map((ripple) =>
        ripple.released ? ripple : { ...ripple, released: true },
      ),
    );

  const child = children;
  const own = child.props;
  const disabled = own.disabled === true || own["aria-disabled"] === true;

  const chain =
    <E,>(theirs: ((event: E) => void) | undefined, ours: (event: E) => void) =>
    (event: E) => {
      theirs?.(event);
      ours(event);
    };

  const peak = color ? 1 : TINT_ALPHA;

  const layer = (
    <span
      key="tap-ripple-layer"
      aria-hidden
      // The radius is inherited, so the ripple stops exactly where the button's
      // corner does however the caller rounded it.
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      {ripples.map((ripple) =>
        motionSafe ? (
          <motion.span
            key={ripple.id}
            className="absolute rounded-full"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
              marginLeft: -ripple.size / 2,
              marginTop: -ripple.size / 2,
              backgroundColor: color ?? "currentColor",
            }}
            initial={{ scale: 0, opacity: peak }}
            animate={{ scale: 1, opacity: ripple.released ? 0 : peak }}
            transition={{
              scale: { duration: duration / 1000, ease: easings.enter },
              opacity: { duration: durations.base, ease: easings.exit },
            }}
          />
        ) : (
          <motion.span
            key={ripple.id}
            className="absolute inset-0"
            style={{ backgroundColor: color ?? "currentColor" }}
            initial={{ opacity: peak }}
            animate={{ opacity: ripple.released ? 0 : peak }}
            transition={{ duration: durations.fast, ease: easings.exit }}
          />
        ),
      )}
    </span>
  );

  return React.cloneElement(
    child,
    {
      className: cn("relative", own.className),
      onPointerDown: chain(own.onPointerDown, (event) => {
        // Primary button only, and never on a button that has said no.
        if (disabled || event.button !== 0) return;
        spawn(event.currentTarget, { x: event.clientX, y: event.clientY });
      }),
      onPointerUp: chain(own.onPointerUp, release),
      onPointerLeave: chain(own.onPointerLeave, release),
      onPointerCancel: chain(own.onPointerCancel, release),
      onKeyDown: chain(own.onKeyDown, (event) => {
        if (disabled || event.repeat) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        spawn(event.currentTarget, null);
      }),
      onKeyUp: chain(own.onKeyUp, release),
      // A key held while focus moves away never gets its keyup.
      onBlur: chain(own.onBlur, release),
    },
    own.children,
    layer,
  );
}
