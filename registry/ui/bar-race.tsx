"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const PALETTE = [
  "oklch(0.62 0.2 262)",
  "oklch(0.72 0.15 162)",
  "oklch(0.74 0.19 350)",
  "oklch(0.78 0.15 52)",
  "oklch(0.8 0.14 190)",
  "oklch(0.68 0.18 300)",
];

function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export type BarRaceItem = {
  id: string;
  label: string;
  value: number;
  color?: string;
};

export type BarRaceProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Current standings; the list re-ranks itself by value. */
  items: BarRaceItem[];
  /** Fixed scale ceiling; defaults to the current leader. */
  max?: number;
  /** Formats the trailing readout. */
  format?: (value: number) => string;
  className?: string;
};

/**
 * A ranked bar chart that races. When the values change the bars grow or shrink
 * and the rows swap places with a FLIP glide, so a lead change reads as one
 * continuous overtake rather than a redraw. Presented as a list for assistive
 * tech. Under reduced motion the bars resize and re-rank without the glide.
 */
export function BarRace({
  ref,
  items,
  max,
  format = (value) => value.toLocaleString(),
  className,
}: BarRaceProps) {
  const motionSafe = useMotionSafe();
  const ranked = [...items].sort((a, b) => b.value - a.value);
  const ceiling =
    max ?? ranked.reduce((top, item) => Math.max(top, item.value), 0) ?? 1;
  const safeCeiling = ceiling > 0 ? ceiling : 1;

  const layoutTransition = motionSafe ? springs.glide : { duration: 0 };

  return (
    <div
      ref={ref}
      role="list"
      className={cn("flex flex-col gap-2", className)}
    >
      {ranked.map((item, index) => {
        const color =
          item.color ?? PALETTE[hash(item.id) % PALETTE.length] ?? PALETTE[0];
        const pct = Math.max(2, (item.value / safeCeiling) * 100);
        return (
          <motion.div
            key={item.id}
            role="listitem"
            aria-label={`${index + 1}. ${item.label}: ${format(item.value)}`}
            layout={motionSafe}
            transition={layoutTransition}
            className="flex items-center gap-3"
          >
            <span className="text-ink-3 w-4 shrink-0 text-right font-mono text-xs tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-ink truncate text-sm font-medium">
                  {item.label}
                </span>
                <span className="text-ink-2 shrink-0 font-mono text-xs tabular-nums">
                  {format(item.value)}
                </span>
              </div>
              <div className="bg-surface-2 h-2.5 overflow-hidden rounded-full">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: color }}
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={
                    motionSafe
                      ? springs.glide
                      : { duration: durations.blink }
                  }
                />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
