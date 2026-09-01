"use client";

import * as React from "react";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DistillSource = { id: string; label: string };

export type VignetteDistillProps = {
  /** The left column of raw material. */
  left?: DistillSource[];
  /** The right column. */
  right?: DistillSource[];
  /** What it all becomes. */
  product?: string;
  /** The stamped line once every source is folded in. */
  stamped?: string;
  /** Seconds between folds. @default 0.9 */
  stepSeconds?: number;
  /** Seconds the finished stamp holds before the loop resets. @default 3 */
  restSeconds?: number;
  className?: string;
};

const DEFAULT_LEFT: DistillSource[] = [
  { id: "l1", label: "Tide table" },
  { id: "l2", label: "Crane windows" },
  { id: "l3", label: "Crew rest" },
  { id: "l4", label: "Gate notes" },
];

const DEFAULT_RIGHT: DistillSource[] = [
  { id: "r1", label: "Weather feed" },
  { id: "r2", label: "Berth ledger" },
  { id: "r3", label: "Standing rules" },
  { id: "r4", label: "Radio log" },
];

/**
 * Many inputs, one product: two columns of sources fold into the centre one
 * by one — each chip lights, leans toward the middle, and dims as spent —
 * and when the last is in, the product stamps itself finished. The scene is
 * the argument for anything that reads a mess and returns a plan.
 * Presentational and marked as one image.
 *
 * Reduced motion: shown finished — every source folded, the stamp standing.
 */
export function VignetteDistill({
  left = DEFAULT_LEFT,
  right = DEFAULT_RIGHT,
  product = "The morning board",
  stamped = "Cut for 06:00",
  stepSeconds = 0.9,
  restSeconds = 3,
  className,
}: VignetteDistillProps) {
  const motionSafe = useMotionSafe();
  const total = left.length + right.length;
  const [folded, setFolded] = React.useState(motionSafe ? 0 : total);

  // Render adjustment: RM flips or the source count changes → restart clean.
  const [loopKey, setLoopKey] = React.useState(`${motionSafe}:${total}`);
  if (loopKey !== `${motionSafe}:${total}`) {
    setLoopKey(`${motionSafe}:${total}`);
    setFolded(motionSafe ? 0 : total);
  }

  React.useEffect(() => {
    if (!motionSafe) return;
    let cancelled = false;
    let timer: number;
    const advance = (count: number) => {
      if (cancelled) return;
      if (count < total) {
        timer = window.setTimeout(
          () => {
            setFolded(count + 1);
            advance(count + 1);
          },
          count === 0 ? 700 : Math.max(0.3, stepSeconds) * 1000,
        );
      } else {
        timer = window.setTimeout(
          () => {
            setFolded(0);
            advance(0);
          },
          Math.max(1, restSeconds) * 1000,
        );
      }
    };
    advance(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [motionSafe, total, stepSeconds, restSeconds]);

  const done = folded >= total;

  // Sources fold alternating left, right, left… so the columns drain evenly.
  const foldOrderIndex = (side: "left" | "right", index: number) =>
    side === "left" ? index * 2 : index * 2 + 1;

  const chip = (
    source: DistillSource,
    side: "left" | "right",
    index: number,
  ) => {
    const order = foldOrderIndex(side, index);
    const spent = order < folded;
    const active = order === folded && motionSafe;
    return (
      <motion.span
        key={source.id}
        animate={{
          opacity: spent ? 0.35 : 1,
          x: spent ? (side === "left" ? 10 : -10) : 0,
          scale: active ? 1.06 : 1,
        }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap",
          side === "right" && "flex-row-reverse",
          active
            ? "border-hairline-strong bg-primary/10 text-ink"
            : "border-hairline bg-surface-1 text-ink-2",
        )}
      >
        <span
          className={cn(
            "size-1 rounded-full",
            spent ? "bg-[var(--success,var(--primary))]" : "bg-ink-3/40",
          )}
        />
        {source.label}
      </motion.span>
    );
  };

  return (
    <div
      role="img"
      aria-label={`${product}, distilled from ${[...left, ...right]
        .map((s) => s.label)
        .join(", ")} — ${stamped}`}
      className={cn("w-full max-w-sm", className)}
    >
      <div
        aria-hidden
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
      >
        <span className="flex flex-col items-end gap-1.5">
          {left.map((source, index) => chip(source, "left", index))}
        </span>

        {/* The product, thickening as sources fold in. */}
        <motion.span
          animate={{ scale: done && motionSafe ? 1.03 : 1 }}
          transition={motionSafe ? springs.recoil : { duration: 0 }}
          className={cn(
            "flex flex-col items-center gap-1 rounded-3 border px-3.5 py-3 text-center",
            done
              ? "border-hairline-strong bg-surface-2 shadow-raised"
              : "border-hairline bg-surface-1",
          )}
        >
          <span className="text-xs font-semibold tracking-tight text-ink">
            {product}
          </span>
          <span className="relative grid h-4 place-items-center">
            {done ? (
              <motion.span
                initial={
                  motionSafe ? { opacity: 0, y: 4 } : { opacity: 1, y: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
                className="flex items-center gap-1 font-mono text-[9px] tracking-[0.06em] text-[var(--success,var(--primary))]"
              >
                <Check className="size-3" />
                {stamped}
              </motion.span>
            ) : (
              <span className="font-mono text-[9px] tracking-[0.06em] text-ink-3">
                {folded} of {total} in
              </span>
            )}
          </span>
        </motion.span>

        <span className="flex flex-col items-start gap-1.5">
          {right.map((source, index) => chip(source, "right", index))}
        </span>
      </div>
    </div>
  );
}
