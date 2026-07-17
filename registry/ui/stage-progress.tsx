"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Stage = {
  /** Stable identity. */
  id: string;
  /** Named in the readout and announced through aria-valuetext. */
  label: string;
};

export type StageProgressProps = {
  stages: Stage[];
  /** Index of the stage in flight. Everything before it has landed. */
  current: number;
  /** 0..1 within the current stage. Omit it for an indeterminate stage. */
  progress?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Progress that admits it has parts. Each stage owns a segment: the ones behind
 * you are filled and stamped with a tick that draws itself, the one in flight
 * fills to its own fraction (or breathes when it cannot say), and the ones ahead
 * wait as empty track. Knowing *which* stage is slow is the whole point.
 *
 * Fills ride `scaleX` off a left origin rather than an animated width, so the
 * bar never triggers layout. The whole strip reports as one progressbar whose
 * `aria-valuetext` names the stage rather than reciting a percentage.
 *
 * Reduced motion: fills land in a frame, the tick is simply there, and the
 * indeterminate stage holds steady instead of breathing.
 */
export function StageProgress({
  stages,
  current,
  progress,
  className,
  "aria-label": ariaLabel = "Progress",
}: StageProgressProps) {
  const motionSafe = useMotionSafe();
  const indeterminate = progress === undefined;
  const within = progress ?? 0;
  const value = Math.min(stages.length, Math.max(0, current + within));
  const stage = stages[Math.min(Math.max(current, 0), stages.length - 1)];

  const fillOf = (index: number) => {
    if (index < current) return 1;
    if (index === current) return indeterminate ? 0 : within;
    return 0;
  };

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={stages.length}
      aria-valuenow={Number(value.toFixed(2))}
      aria-valuetext={
        current >= stages.length
          ? "Complete"
          : `Stage ${Math.min(current + 1, stages.length)} of ${stages.length}: ${stage?.label ?? ""}`
      }
      className={cn("flex w-full flex-col gap-2.5", className)}
    >
      <div className="flex gap-1.5">
        {stages.map((item, index) => (
          <div
            key={item.id}
            className="bg-surface-2 relative h-1.5 flex-1 overflow-hidden rounded-full"
          >
            <motion.span
              aria-hidden
              className="bg-primary absolute inset-0 origin-left rounded-full"
              initial={false}
              animate={{ scaleX: fillOf(index) }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
            {index === current && indeterminate && motionSafe && (
              <motion.span
                aria-hidden
                className="bg-primary absolute inset-0 rounded-full"
                animate={{ opacity: [0.15, 0.5, 0.15] }}
                transition={{
                  duration: 1.2,
                  ease: easings.move,
                  repeat: Infinity,
                }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-between gap-2">
        {stages.map((item, index) => (
          <span
            key={item.id}
            className={cn(
              "flex min-w-0 items-center gap-1 font-mono text-[10px] tracking-[0.08em] uppercase",
              index < current
                ? "text-ink-2"
                : index === current
                  ? "text-[var(--signal,var(--primary))]"
                  : "text-ink-3",
            )}
          >
            {index < current && <StageTick motionSafe={motionSafe} />}
            <span className="truncate">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** The stamp a landed stage earns. */
function StageTick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className="size-3 shrink-0" fill="none" aria-hidden>
      <motion.path
        d="M2.5 6.4 L4.9 8.8 L9.5 3.4"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={
          motionSafe
            ? { duration: durations.fast, ease: easings.enter }
            : { duration: 0 }
        }
      />
    </svg>
  );
}
