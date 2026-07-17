"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MarqueeSwapProps = {
  /** The lines to roll through, in order. */
  items: string[];
  /** Seconds each line holds before the next rolls up. @default 2.6 */
  interval?: number;
  className?: string;
};

/**
 * One line at a time, rolling upward. The current line lifts out the top as the
 * next rises from the bottom into the same slot, so a run of phrases reads as a
 * single rolling display rather than a stack. The slot is clipped, so only the
 * live line shows.
 *
 * The live line is announced politely, so the rotation is not lost to a screen
 * reader. Reduced motion is deliberately still: it holds the first line and does
 * not auto-roll, since a headline that keeps moving on its own is exactly what
 * that preference asks to avoid.
 */
export function MarqueeSwap({
  items,
  interval = 2.6,
  className,
}: MarqueeSwapProps) {
  const motionSafe = useMotionSafe();
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (!motionSafe || items.length < 2) return;
    const id = window.setInterval(
      () => setIndex((value) => (value + 1) % items.length),
      interval * 1000,
    );
    return () => clearInterval(id);
  }, [motionSafe, items.length, interval]);

  const shown = motionSafe ? index : 0;
  const line = items[shown] ?? "";

  return (
    <span
      aria-live="polite"
      className={cn(
        "relative inline-flex h-[1.2em] items-center overflow-hidden align-bottom",
        className,
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={shown}
          initial={{ y: motionSafe ? "110%" : 0, opacity: motionSafe ? 0 : 1 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: motionSafe ? "-110%" : 0, opacity: motionSafe ? 0 : 1 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
          className="inline-block whitespace-nowrap"
        >
          {line}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
