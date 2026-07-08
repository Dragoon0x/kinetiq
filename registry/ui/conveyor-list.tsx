"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ConveyorListProps<T> = {
  items: T[];
  /** Stable key per item — drives enter, exit, and reorder identity. */
  keyFor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** Live-region text for a row; when set, the visible row is aria-hidden. */
  announceItem?: (item: T) => string;
  /** Which edge new items feed in from. */
  side?: "top" | "bottom";
  /** Rows shown before the oldest overflow into the "+N more" count. */
  maxVisible?: number;
  /** Accessible name for the log. */
  label?: string;
  className?: string;
};

/**
 * A queue that moves like a belt. New rows slide in from the feed side on
 * `drift` — its critical damping reads as a brake — and land with a tiny
 * scaleY squash on `snap`; existing rows make room via layout shifts on
 * `glide`. Removed rows lift off the belt with a tweened exit while the belt
 * closes ranks; rows past `maxVisible` fade out quietly behind a "+N more"
 * count. Reduced motion swaps all of it for in-place crossfades with instant
 * layout shifts.
 */
export function ConveyorList<T>({
  items,
  keyFor,
  renderItem,
  announceItem,
  side = "top",
  maxVisible = 6,
  label = "Queue",
  className,
}: ConveyorListProps<T>) {
  const motionSafe = useMotionSafe();

  const visible =
    side === "top" ? items.slice(0, maxVisible) : items.slice(-maxVisible);
  const hiddenCount = Math.max(0, items.length - maxVisible);

  // Exit reason resolves at animation time: rows still present in `items`
  // left the window by overflowing; rows gone from `items` were removed.
  // AnimatePresence's `custom` hands the fresh set to exiting rows.
  const liveKeys = new Set(items.map(keyFor));

  const enterOffset =
    (side === "top" ? -1 : 1) * (distances.shift + distances.step);

  const count = hiddenCount > 0 && (
    <p
      className={cn(
        "text-muted-foreground border-border px-3 py-1.5 font-mono text-xs tabular-nums",
        side === "top" ? "border-t" : "border-b",
      )}
    >
      +{hiddenCount} more
    </p>
  );

  return (
    <div
      className={cn(
        "border-border bg-card w-full overflow-hidden rounded-3 border",
        className,
      )}
    >
      {side === "bottom" && count}
      <ul
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={label}
        className="divide-border relative divide-y"
      >
        <AnimatePresence mode="popLayout" initial={false} custom={liveKeys}>
          {visible.map((item) => {
            const id = keyFor(item);
            const variants: Variants = {
              enter: motionSafe
                ? { y: enterOffset, scaleY: 0.97, opacity: 0 }
                : { opacity: 0 },
              settle: motionSafe
                ? {
                    y: 0,
                    scaleY: 1,
                    opacity: 1,
                    transition: {
                      y: springs.drift,
                      // The drift approach reads as the brake; the delayed
                      // squash release lands the row in its slot.
                      scaleY: { ...springs.snap, delay: 0.26 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    },
                  }
                : { opacity: 1, transition: { duration: durations.fast } },
              exit: (live: Set<string> | undefined) => {
                if (motionSafe && live && !live.has(id)) {
                  // Removed from the queue: lift off the belt.
                  return {
                    y: -12,
                    scale: 0.98,
                    opacity: 0,
                    transition: exitFor(durations.base),
                  };
                }
                // Overflowed past maxVisible (or reduced motion): fade quietly.
                return { opacity: 0, transition: exitFor(durations.fast) };
              },
            };
            return (
              <motion.li
                key={id}
                layout={motionSafe}
                variants={variants}
                initial="enter"
                animate="settle"
                exit="exit"
                transition={{ layout: springs.glide }}
                className={cn(
                  "bg-card px-3 py-2",
                  side === "top" ? "origin-top" : "origin-bottom",
                )}
              >
                {announceItem ? (
                  <>
                    <div aria-hidden>{renderItem(item)}</div>
                    <span className="sr-only">{announceItem(item)}</span>
                  </>
                ) : (
                  renderItem(item)
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {side === "top" && count}
    </div>
  );
}
