"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type VignetteWaveMeterProps = {
  label?: string;
  /** Bar heights 0–1, cycled as the loop advances; fixed data, no randomness. */
  pattern?: number[];
  /** Index of the marked peak. */
  peakIndex?: number;
  /** Seconds per full pattern rotation. @default 5 */
  cycleSeconds?: number;
  className?: string;
};

const DEFAULT_PATTERN = [
  0.35, 0.5, 0.42, 0.66, 0.58, 0.8, 0.72, 0.94, 0.6, 0.46, 0.55, 0.4, 0.62, 0.5,
  0.74, 0.44,
];

/**
 * A metering loop: bars breathe through a fixed pattern that rotates, with
 * one peak marked and named — the live-signal scene, for heroes about
 * telemetry and throughput. The pattern is data, the rotation is a
 * mount-driven cycle, and nothing is random, so server and client always
 * paint the same meter. One image to assistive tech.
 *
 * Reduced motion: the pattern holds still with the peak marked.
 */
export function VignetteWaveMeter({
  label = "Reshuffles propagating",
  pattern = DEFAULT_PATTERN,
  peakIndex = 7,
  cycleSeconds = 5,
  className,
}: VignetteWaveMeterProps) {
  const motionSafe = useMotionSafe();
  const [offset, setOffset] = React.useState(0);

  React.useEffect(() => {
    if (!motionSafe) return;
    const ms = (cycleSeconds * 1000) / pattern.length;
    const id = window.setInterval(
      () => setOffset((o) => (o + 1) % pattern.length),
      ms,
    );
    return () => window.clearInterval(id);
  }, [motionSafe, pattern.length, cycleSeconds]);

  return (
    <div
      role="img"
      aria-label={`${label}: level meter with the peak marked`}
      className={cn(
        "w-full max-w-xs rounded-4 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div aria-hidden>
        <p className="text-label text-ink-3">{label}</p>
        <div className="mt-3 flex h-16 items-end gap-1">
          {pattern.map((_, index) => {
            const value = pattern[(index + offset) % pattern.length] ?? 0;
            const isPeak = (index + offset) % pattern.length === peakIndex;
            return (
              <motion.span
                key={index}
                className={cn(
                  "flex-1 rounded-t-[2px]",
                  isPeak ? "bg-primary" : "bg-ink-3/40",
                )}
                animate={{ height: `${Math.round(value * 100)}%` }}
                transition={{ duration: motionSafe ? 0.3 : 0, ease: "easeOut" }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="font-mono text-[10px] text-ink-3">live</span>
          <span className="font-mono text-[10px] text-ink-2">peak marked</span>
        </div>
      </div>
    </div>
  );
}
