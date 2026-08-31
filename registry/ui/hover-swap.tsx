"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HoverSwapProps = {
  /** The resting reading. */
  children: React.ReactNode;
  /** The reading it rolls to under hover or focus. */
  alternate: React.ReactNode;
  /** Roll direction. @default "up" */
  direction?: "up" | "down";
  className?: string;
};

/**
 * A label with two readings: at rest it says one thing, and under hover or
 * focus it rolls to the alternate — the old line leaving as the new one
 * arrives, both clipped to the label's own box. For links whose hover state
 * has something to add ("Pricing" → "still free"), nav items, and buttons
 * with a second thought. Both readings live in the accessible name, so the
 * roll is presentation and never information.
 *
 * Reduced motion: the readings crossfade in place.
 */
export function HoverSwap({
  children,
  alternate,
  direction = "up",
  className,
}: HoverSwapProps) {
  const motionSafe = useMotionSafe();
  const [hot, setHot] = React.useState(false);
  const travel = direction === "up" ? -1 : 1;

  return (
    <span
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      className={cn(
        "relative inline-grid overflow-hidden align-bottom",
        className,
      )}
    >
      {/* Both readings reserve the wider box so the label never resizes. */}
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {children}
      </span>
      <span aria-hidden className="invisible col-start-1 row-start-1">
        {alternate}
      </span>

      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={hot ? "alternate" : "resting"}
          initial={
            motionSafe ? { y: `${travel * -110}%`, opacity: 1 } : { opacity: 0 }
          }
          animate={{ y: "0%", opacity: 1 }}
          exit={
            motionSafe ? { y: `${travel * 110}%`, opacity: 1 } : { opacity: 0 }
          }
          transition={motionSafe ? springs.snap : { duration: 0.12 }}
          className="col-start-1 row-start-1"
          aria-hidden
        >
          {hot ? alternate : children}
        </motion.span>
      </AnimatePresence>

      {/* The accessible name carries both readings, always. */}
      <span className="sr-only">
        {children} — {alternate}
      </span>
    </span>
  );
}
