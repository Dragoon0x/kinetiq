"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { SparkChart } from "@/registry/ui/spark-chart";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WindowRow = { id: string; label: string; hint?: string };

export type VignetteAppWindowProps = {
  /** The window's title-bar name. */
  title?: string;
  /** Sidebar rows that cascade in. */
  rows?: WindowRow[];
  /** The headline metric the readout rolls to. */
  metric?: { label: string; value: number; suffix?: string };
  /** The series the spark line draws (chart face). */
  series?: number[];
  seriesLabel?: string;
  /** What the stage shows. @default "chart" */
  face?: "chart" | "board" | "thread";
  className?: string;
};

const BOARD_COLUMNS = [
  { id: "queued", label: "Queued", cards: ["Rig test", "Deck survey"] },
  { id: "running", label: "Running", cards: ["Coating pass"] },
  { id: "done", label: "Done", cards: ["Hull sounding", "Crane relube"] },
];

const THREAD_ROWS = [
  { id: "t1", from: "Gate", line: "Crew B acknowledged the swap" },
  { id: "t2", from: "Board", line: "r3 posted to both yards" },
  { id: "t3", from: "Holds", line: "Crane 2 clear from 13:00" },
];

const DEFAULT_ROWS: WindowRow[] = [
  { id: "r1", label: "Morning board", hint: "live" },
  { id: "r2", label: "Crews", hint: "4" },
  { id: "r3", label: "Holds" },
  { id: "r4", label: "Exports" },
];

const DEFAULT_SERIES = [22, 28, 26, 34, 31, 38, 44, 41, 52];

/**
 * A product window that paints itself in: the chrome lands first, sidebar
 * rows cascade, the spark line draws its series, and the headline number
 * rolls up on the readout — the standard product-demo vignette for a hero
 * that wants to show software working without shipping a screenshot. Purely
 * presentational: every interactive part is decoration at the vignette's
 * scale, marked aria-hidden behind one honest label.
 *
 * Reduced motion: the window prints complete; the numeral still rolls once.
 */
export function VignetteAppWindow({
  title = "waylight — north basin",
  rows = DEFAULT_ROWS,
  metric = { label: "Mornings cut early", value: 96, suffix: "%" },
  series = DEFAULT_SERIES,
  seriesLabel = "Boards cut per week",
  face = "chart",
  className,
}: VignetteAppWindowProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(rows.length);

  return (
    <div
      role="img"
      aria-label={`Product window: ${metric.label} ${metric.value}${metric.suffix ?? ""}`}
      className={cn("w-full max-w-md", className)}
    >
      <motion.div
        aria-hidden
        initial={{
          opacity: motionSafe ? 0 : 1,
          y: motionSafe ? distances.shift : 0,
        }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { duration: durations.base, ease: easings.enter }
            : { duration: 0 }
        }
        className="overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised"
      >
        {/* Title bar. */}
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-2 rounded-full border border-hairline-strong"
              />
            ))}
          </span>
          <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.06em] text-ink-3">
            {title}
          </span>
        </div>

        <div className="grid grid-cols-[7rem_minmax(0,1fr)]">
          {/* Sidebar rows cascade in. */}
          <div className="border-r border-hairline p-2">
            {rows.map((row, index) => (
              <motion.div
                key={row.id}
                initial={{
                  opacity: motionSafe ? 0 : 1,
                  x: motionSafe ? -distances.nudge : 0,
                }}
                animate={{ opacity: 1, x: 0 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: 0.15 + index * step,
                      }
                    : { duration: 0 }
                }
                className={cn(
                  "flex items-baseline justify-between gap-1 rounded-1 px-1.5 py-1",
                  index === 0 && "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "truncate text-[11px]",
                    index === 0 ? "font-medium text-ink" : "text-ink-2",
                  )}
                >
                  {row.label}
                </span>
                {row.hint && (
                  <span className="shrink-0 font-mono text-[9px] text-ink-3">
                    {row.hint}
                  </span>
                )}
              </motion.div>
            ))}
          </div>

          {/* Stage: one of three faces. */}
          <div className="p-3">
            {face === "chart" && (
              <>
                <p className="text-label text-ink-3">{metric.label}</p>
                <p className="mt-0.5 flex items-baseline gap-0.5">
                  <Readout value={metric.value} size="lg" />
                  {metric.suffix && (
                    <span className="text-sm text-ink-3">{metric.suffix}</span>
                  )}
                </p>
                <div className="mt-2">
                  <SparkChart
                    data={series}
                    variant="area"
                    height={56}
                    label={seriesLabel}
                  />
                </div>
              </>
            )}
            {face === "board" && (
              <div className="grid h-full grid-cols-3 gap-1.5">
                {BOARD_COLUMNS.map((column, columnIndex) => (
                  <div key={column.id} className="min-w-0">
                    <p className="truncate font-mono text-[8px] tracking-[0.08em] text-ink-3 uppercase">
                      {column.label}
                    </p>
                    <div className="mt-1 flex flex-col gap-1">
                      {column.cards.map((card, cardIndex) => (
                        <motion.div
                          key={card}
                          initial={{ opacity: motionSafe ? 0 : 1 }}
                          animate={{ opacity: 1 }}
                          transition={
                            motionSafe
                              ? {
                                  duration: durations.base,
                                  ease: easings.enter,
                                  delay:
                                    0.2 + (columnIndex * 2 + cardIndex) * 0.09,
                                }
                              : { duration: 0 }
                          }
                          className={cn(
                            "truncate rounded-1 border border-hairline bg-surface-0 px-1.5 py-1 text-[9px]",
                            column.id === "running"
                              ? "border-primary/40 text-ink"
                              : "text-ink-2",
                          )}
                        >
                          {card}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {face === "thread" && (
              <div className="flex flex-col gap-1.5">
                {THREAD_ROWS.map((row, index) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: motionSafe ? 0 : 1 }}
                    animate={{ opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: 0.2 + index * 0.12,
                          }
                        : { duration: 0 }
                    }
                    className="rounded-2 border border-hairline bg-surface-0 px-2 py-1.5"
                  >
                    <p className="font-mono text-[8px] tracking-[0.08em] text-ink-3 uppercase">
                      {row.from}
                    </p>
                    <p className="truncate text-[10px] text-ink-2">
                      {row.line}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
