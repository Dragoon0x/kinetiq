"use client";

import * as React from "react";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ActiveFilter = {
  id: string;
  label: string;
  /** How many results would return if only this one were dropped. */
  wouldReturn: number;
};

export type EmptyNoMatchesProps = {
  headline?: string;
  copy?: string;
  /** The filters currently narrowing the set, each with its cost. */
  filters?: ActiveFilter[];
  /** Total rows in the unfiltered set. */
  totalWithout?: number;
  clearLabel?: string;
  onClearAll?: () => void;
  onDrop?: (id: string) => void;
  className?: string;
};

const DEFAULT_FILTERS: ActiveFilter[] = [
  { id: "f1", label: "Yard: cold store", wouldReturn: 0 },
  { id: "f2", label: "Outcome: failed", wouldReturn: 14 },
  { id: "f3", label: "Last 24 hours", wouldReturn: 61 },
];

/**
 * Nothing matched — said as a diagnosis rather than a shrug. Every active
 * filter is listed with the number of rows that would come back if it alone
 * were dropped, so the reader can see which one is doing the damage and
 * remove exactly that one. The usual empty result tells you nothing found and
 * leaves you to guess; this one hands over the arithmetic.
 */
export function EmptyNoMatches({
  headline = "Nothing matches all three.",
  copy = "Each filter below shows what would come back without it. The one costing you everything is marked.",
  filters = DEFAULT_FILTERS,
  totalWithout = 214,
  clearLabel = "Clear all filters",
  onClearAll,
  onDrop,
  className,
}: EmptyNoMatchesProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [dropped, setDropped] = React.useState<string[]>([]);

  const live = filters.filter((filter) => !dropped.includes(filter.id));

  // The filter that alone returns nothing is the one actually to blame.
  const culprit = React.useMemo(
    () => live.find((filter) => filter.wouldReturn === 0)?.id,
    [live],
  );

  const drop = (id: string) => {
    setDropped((prev) => [...prev, id]);
    onDrop?.(id);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-xl px-6 py-20 text-center sm:py-28">
        <p className="flex items-baseline justify-center gap-1.5">
          <Readout value={0} size="lg" />
          <span className="text-sm text-ink-3">of</span>
          <Readout value={totalWithout} />
          <span className="text-sm text-ink-3">rows</span>
        </p>

        <h2
          id={headingId}
          className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
        >
          {headline}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-2">
          {copy}
        </p>

        <ul className="mx-auto mt-8 flex max-w-md flex-col gap-2">
          <AnimatePresence initial={false}>
            {live.map((filter) => (
              <motion.li
                key={filter.id}
                layout={motionSafe}
                initial={false}
                exit={{
                  opacity: 0,
                  x: motionSafe ? -distances.shift : 0,
                  transition: exitFor(
                    motionSafe ? durations.base : durations.fast,
                  ),
                }}
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-2 border border-hairline px-3 py-2 text-left",
                  filter.id === culprit &&
                    "border-hairline-strong bg-surface-1",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {filter.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px]",
                    filter.wouldReturn === 0
                      ? "text-destructive"
                      : "text-ink-3",
                  )}
                >
                  {filter.wouldReturn === 0
                    ? "returns nothing alone"
                    : `+${filter.wouldReturn} without it`}
                </span>
                <button
                  type="button"
                  onClick={() => drop(filter.id)}
                  aria-label={`Remove filter: ${filter.label}`}
                  className="shrink-0 text-ink-3 transition-colors hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        <div className="mt-8">
          <PressureButton
            onClick={() => {
              setDropped(filters.map((filter) => filter.id));
              onClearAll?.();
            }}
            disabled={live.length === 0}
          >
            {clearLabel}
          </PressureButton>
        </div>
      </div>
    </section>
  );
}
