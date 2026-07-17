"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MasonryItem = {
  /** Stable identity — the key that lets motion track a tile across reflows. */
  id: string;
  node: React.ReactNode;
};

export type MasonryFlowProps = {
  items: MasonryItem[];
  /** Column width; the browser fits as many as span, so it stays responsive. */
  minColumnWidth?: string;
  className?: string;
};

/**
 * A masonry that keeps its tiles when the set changes. Columns are laid by the
 * browser, so the count follows the width for free; when a filter drops or adds
 * tiles, each survivor FLIPs from its old box to its new one on `glide` while the
 * ones leaving fade down and the ones arriving fade up — so a filter reads as a
 * rearrangement, not a repaint.
 *
 * Tiles are keyed by a stable id, which is what lets motion follow the same tile
 * across a reflow rather than cross-fading two unrelated boxes. Reduced motion
 * drops the FLIP and the fades; tiles simply appear in their new places.
 */
export function MasonryFlow({
  items,
  minColumnWidth = "10rem",
  className,
}: MasonryFlowProps) {
  const motionSafe = useMotionSafe();

  return (
    <div
      className={cn("w-full", className)}
      style={{ columnWidth: minColumnWidth, columnGap: "0.75rem" }}
    >
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.div
            key={item.id}
            layout={motionSafe ? "position" : false}
            initial={{ opacity: 0, scale: motionSafe ? 0.92 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{
              opacity: 0,
              scale: motionSafe ? 0.92 : 1,
              transition: { duration: motionSafe ? durations.fast : 0 },
            }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            className="mb-3 break-inside-avoid"
          >
            {item.node}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
