"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SkeletonWeaveProps = {
  /** While true the placeholder holds the space; false lets the content in. */
  loading: boolean;
  /** Placeholder row widths, longest first reads most like prose. */
  rows?: string[];
  /** Announced politely while the placeholder is up. */
  loadingLabel?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * A placeholder that holds the shape of what is coming, then hands over. A
 * sheen sweeps each row on a diagonal, staggered down the stack by `cascade`,
 * so the block reads as one woven surface rather than a row of blinking bars.
 * When the content arrives the placeholder fades out and the real thing rises
 * the last few pixels into place.
 *
 * The placeholder is `aria-hidden` and the region is marked `aria-busy`, so
 * assistive tech is told the state once rather than made to read a pile of
 * decorative bars; a polite live region announces the wait.
 *
 * Reduced motion: no sheen and no rise — the placeholder is a still surface and
 * the content simply appears. Same states, same announcements.
 */
export function SkeletonWeave({
  loading,
  rows = ["100%", "92%", "64%"],
  loadingLabel = "Loading",
  children,
  className,
}: SkeletonWeaveProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(rows.length);

  return (
    <div
      aria-busy={loading || undefined}
      className={cn("relative w-full", className)}
    >
      <AnimatePresence initial={false} mode="wait">
        {loading ? (
          <motion.div
            key="weave"
            aria-hidden
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            className="flex flex-col gap-2.5"
          >
            {rows.map((width, index) => (
              <div
                key={`${index}-${width}`}
                className="bg-surface-2 relative h-3.5 overflow-hidden rounded-1"
                style={{ width }}
              >
                {motionSafe && (
                  <motion.span
                    className="absolute inset-y-0 -left-1/2 w-1/2 skew-x-12"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, var(--border), transparent)",
                    }}
                    animate={{ x: ["0%", "400%"] }}
                    transition={{
                      duration: 1.4,
                      ease: easings.linear,
                      repeat: Infinity,
                      delay: index * step,
                    }}
                  />
                )}
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: durations.fast }
            }
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <span role="status" aria-live="polite" className="sr-only">
          {loadingLabel}
        </span>
      )}
    </div>
  );
}
