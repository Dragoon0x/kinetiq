"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WorkLampFace = "grid" | "orbit" | "dots" | "sweep";

export type WorkLampProps = {
  /** What the bench is doing, in one word or two. */
  label?: string;
  /** Which lamp is lit. @default "grid" */
  face?: WorkLampFace;
  /** Show the elapsed readout beside the label. @default true */
  showElapsed?: boolean;
  /** Externally-owned elapsed seconds; omit to let the lamp keep time from mount. */
  elapsed?: number;
  className?: string;
};

/** 5x5 shimmer order: a diagonal wave, precomputed so SSR and client agree. */
const GRID = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  delay: ((i % 5) + Math.floor(i / 5)) * 0.07,
}));

/**
 * The lamp that says the bench is busy. A small instrument for agent waits:
 * one of four honest faces — a shimmering pixel grid, three breathing dots,
 * an orbiting pair, a sweeping bar — beside the work's name and a ticking
 * elapsed readout, because a wait with a clock on it is a report and a wait
 * without one is a hope.
 *
 * The elapsed numeral is plain tabular figures rather than a rolling readout
 * on purpose: at ten ticks a second a carry-roll is churnless noise, and the
 * calm of the digit change is the point. Time starts at mount (never wall
 * clock at render), so server and client always agree on 0.0s.
 *
 * Reduced motion: the faces hold still at mid-state; the clock keeps ticking,
 * because elapsed time is information, not decoration.
 */
export function WorkLamp({
  label = "Working",
  face = "grid",
  showElapsed = true,
  elapsed,
  className,
}: WorkLampProps) {
  const motionSafe = useMotionSafe();
  const [ticks, setTicks] = React.useState(0);
  const owned = elapsed === undefined;

  React.useEffect(() => {
    if (!owned || !showElapsed) return;
    const id = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [owned, showElapsed]);

  const seconds = owned ? ticks / 10 : elapsed;

  return (
    <div
      role="status"
      aria-live="off"
      aria-label={`${label}, ${seconds.toFixed(1)} seconds elapsed`}
      className={cn(
        "inline-flex items-center gap-2.5 text-sm text-ink-2",
        className,
      )}
    >
      <span aria-hidden className="flex size-5 items-center justify-center">
        {face === "grid" && (
          <span className="grid grid-cols-5 gap-px">
            {GRID.map((cell) => (
              <motion.span
                key={cell.id}
                className="size-[3px] rounded-[0.5px] bg-ink-3"
                animate={
                  motionSafe ? { opacity: [0.15, 1, 0.15] } : { opacity: 0.45 }
                }
                transition={
                  motionSafe
                    ? {
                        duration: 1.4,
                        ease: "easeInOut",
                        repeat: Infinity,
                        delay: cell.delay,
                      }
                    : { duration: 0 }
                }
              />
            ))}
          </span>
        )}
        {face === "dots" && (
          <span className="flex items-center gap-[3px]">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full bg-ink-3"
                animate={
                  motionSafe ? { opacity: [0.25, 1, 0.25] } : { opacity: 0.6 }
                }
                transition={
                  motionSafe
                    ? {
                        duration: 1.1,
                        ease: "easeInOut",
                        repeat: Infinity,
                        delay: i * 0.18,
                      }
                    : { duration: 0 }
                }
              />
            ))}
          </span>
        )}
        {face === "orbit" && (
          <motion.span
            className="relative block size-4"
            animate={motionSafe ? { rotate: 360 } : { rotate: 45 }}
            transition={
              motionSafe
                ? { duration: 1.6, ease: "linear", repeat: Infinity }
                : { duration: 0 }
            }
          >
            <span className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-ink-3" />
            <span className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-ink-3 opacity-50" />
          </motion.span>
        )}
        {face === "sweep" && (
          <span className="relative block h-1 w-5 overflow-hidden rounded-full bg-surface-2">
            <motion.span
              className="absolute inset-y-0 w-2 rounded-full bg-ink-3"
              animate={motionSafe ? { x: [-8, 20] } : { x: 6 }}
              transition={
                motionSafe
                  ? { duration: 1.2, ease: "easeInOut", repeat: Infinity }
                  : { duration: 0 }
              }
            />
          </span>
        )}
      </span>

      <motion.span
        // The label arrives once, softly; it does not loop.
        initial={{ opacity: motionSafe ? 0 : 1 }}
        animate={{ opacity: 1 }}
        transition={
          motionSafe
            ? { duration: durations.base, ease: easings.enter }
            : { duration: 0 }
        }
        className="font-medium"
      >
        {label}
      </motion.span>

      {showElapsed && (
        <motion.span
          layout={motionSafe}
          transition={springs.snap}
          className="font-mono text-[11px] tracking-[0.04em] text-ink-3 tabular-nums"
        >
          {seconds.toFixed(1)}s
        </motion.span>
      )}
    </div>
  );
}
