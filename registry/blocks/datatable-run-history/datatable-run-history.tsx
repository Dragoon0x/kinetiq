"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { SparkChart } from "@/registry/ui/spark-chart";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RunOutcome = "clean" | "slow" | "failed";

export type RunRow = {
  id: string;
  /** What runs — a yard, a job, a pipeline. */
  name: string;
  detail: string;
  outcome: RunOutcome;
  /** Latest duration, in the unit named by durationLabel. */
  duration: number;
  /** The last N durations, oldest first. The row's whole argument. */
  history: number[];
};

export type DatatableRunHistoryProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  rows?: RunRow[];
  durationLabel?: string;
  historyLabel?: string;
  className?: string;
};

const OUTCOME_META: Record<
  RunOutcome,
  {
    variant: "success" | "warn" | "danger";
    label: string;
    /**
     * spark-chart strokes with `var(--signal, …)`, so the row hands the
     * trend its verdict colour rather than the section restyling the chart.
     */
    signal?: string;
  }
> = {
  clean: { variant: "success", label: "clean" },
  slow: {
    variant: "warn",
    label: "slow",
    signal: "var(--warn, var(--primary))",
  },
  failed: {
    variant: "danger",
    label: "failed",
    signal: "var(--danger, var(--destructive))",
  },
};

const DEFAULT_ROWS: RunRow[] = [
  {
    id: "r1",
    name: "North basin",
    detail: "Two crews · crane shared",
    outcome: "clean",
    duration: 41,
    history: [58, 55, 52, 49, 47, 44, 43, 41],
  },
  {
    id: "r2",
    name: "Kettle point",
    detail: "One crew · tide-bound",
    outcome: "clean",
    duration: 33,
    history: [39, 37, 38, 35, 34, 34, 33, 33],
  },
  {
    id: "r3",
    name: "Relay floor",
    detail: "Four crews · continuous",
    outcome: "slow",
    duration: 78,
    history: [52, 54, 51, 58, 63, 69, 74, 78],
  },
  {
    id: "r4",
    name: "Dry dock 2",
    detail: "Project cargo · by exception",
    outcome: "clean",
    duration: 26,
    history: [31, 30, 29, 29, 28, 27, 27, 26],
  },
  {
    id: "r5",
    name: "Cold store",
    detail: "One crew · sequence locked",
    outcome: "failed",
    duration: 0,
    history: [44, 43, 45, 44, 46, 45, 44, 0],
  },
];

/**
 * A report grid where each row carries its own history: the latest number, the
 * outcome, and the last eight runs plotted small beside them, so a row that is
 * fine today but drifting is visible without opening anything. The ops desk is
 * for working a dataset — sorting, selecting, acting; this one is for reading
 * a trend across rows at a glance, which is a different job and wants a
 * different instrument.
 */
export function DatatableRunHistory({
  eyebrow = "Waylight · morning cut times",
  headline = "Every yard, and the direction it is heading.",
  copy = "The number is today. The line is the last eight mornings — which is where a yard tells you it is in trouble, well before the number does.",
  rows = DEFAULT_ROWS,
  durationLabel = "min to cut",
  historyLabel = "last 8 mornings",
  className,
}: DatatableRunHistoryProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(rows.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="mt-10 rounded-4 border border-hairline">
          {/* The header is a caption row, not a control bar — nothing here
              sorts, because the argument is the shape of each line. */}
          <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_8rem_5.5rem] items-center gap-4 border-b border-hairline px-5 py-3 text-label text-ink-3 sm:grid">
            <span>Yard</span>
            <span className="text-right">{durationLabel}</span>
            <span>{historyLabel}</span>
            <span className="text-right">Outcome</span>
          </div>

          <ul>
            {rows.map((row, index) => {
              const meta = OUTCOME_META[row.outcome];
              return (
                <motion.li
                  key={row.id}
                  initial={{ opacity: motionSafe ? 0 : 1 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: index * step,
                        }
                      : { duration: 0 }
                  }
                  className="grid grid-cols-2 items-center gap-x-4 gap-y-3 border-b border-hairline px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_5.5rem]"
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <p className="truncate font-medium text-ink">{row.name}</p>
                    <p className="truncate text-sm text-ink-3">{row.detail}</p>
                  </div>

                  <p className="flex items-baseline justify-start gap-1 sm:justify-end">
                    <Readout value={row.duration} rollOn="any" />
                    <span className="text-xs text-ink-3 sm:hidden">
                      {durationLabel}
                    </span>
                  </p>

                  <div
                    className="col-span-2 min-w-0 sm:col-span-1"
                    style={
                      meta.signal
                        ? ({ "--signal": meta.signal } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <SparkChart
                      data={row.history}
                      variant="line"
                      height={26}
                      label={`${row.name}, ${historyLabel}`}
                      format={(y) => `${y} min`}
                    />
                  </div>

                  <p className="flex justify-end sm:justify-end">
                    <StatusSeal variant={meta.variant}>{meta.label}</StatusSeal>
                  </p>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
