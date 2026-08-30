"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { SparkChart } from "@/registry/ui/spark-chart";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InsightDelta = {
  id: string;
  label: string;
  /** Pre-formatted deltas — the reel formats nothing. */
  primary: string;
  secondary?: string;
  /** Whether this line is good or bad news, for the tint. */
  tone?: "up" | "down" | "flat";
};

export type Insight = {
  id: string;
  /** The sentence before the subject chip. */
  lead: string;
  /** Rides inside the sentence as a chip; omit for a plain sentence. */
  subject?: string;
  /** The sentence after the chip. */
  leadAfter?: string;
  deltas?: InsightDelta[];
  /** The series behind the claim, drawn on the spark instrument. */
  series?: number[];
  seriesLabel?: string;
  /** The offered next ask. */
  followUp?: string;
};

export type InsightReelProps = {
  heading?: string;
  insights?: Insight[];
  onFollowUp?: (text: string, insight: Insight) => void;
  className?: string;
};

const DEFAULT_INSIGHTS: Insight[] = [
  {
    id: "i1",
    lead: "Reshuffles at",
    subject: "North basin",
    leadAfter: "are trending down for the fourth straight week.",
    deltas: [
      {
        id: "d1",
        label: "Reshuffles",
        primary: "−31%",
        secondary: "−12/wk",
        tone: "up",
      },
      { id: "d2", label: "Radio calls", primary: "−18%", tone: "up" },
    ],
    series: [44, 41, 38, 39, 34, 31, 28, 26],
    seriesLabel: "Reshuffles per week",
    followUp: "What changed four weeks ago?",
  },
  {
    id: "i2",
    lead: "Crane 2 holds at",
    subject: "Kettle point",
    leadAfter: "are eating the rig-test window.",
    deltas: [
      {
        id: "d3",
        label: "Holds",
        primary: "+40%",
        secondary: "+6/wk",
        tone: "down",
      },
      { id: "d4", label: "Window kept", primary: "61%", tone: "down" },
    ],
    series: [9, 11, 10, 13, 14, 17, 19, 21],
    seriesLabel: "Crane 2 holds per week",
    followUp: "Draft a hold-deadline change",
  },
  {
    id: "i3",
    lead: "Same-day shift closes at",
    subject: "Relay floor",
    leadAfter: "held steady through the surge.",
    deltas: [
      {
        id: "d5",
        label: "Closed same day",
        primary: "88%",
        secondary: "±0",
        tone: "flat",
      },
    ],
    series: [86, 88, 87, 89, 88, 87, 88, 88],
    seriesLabel: "Same-day closes",
    followUp: "Show the two late closes",
  },
];

/**
 * Findings on a reel: one insight at a time — the claim as a sentence with
 * its subject chipped, the deltas beside it pre-formatted and toned, and the
 * series behind the claim drawn on the spark instrument so the reader can
 * scrub the evidence themselves. Dots page the reel; each card offers one
 * follow-up, because an insight worth surfacing is worth asking about.
 *
 * The chart is the spark instrument, crosshair and all — the reel adds
 * paging, never chart mechanics. Reduced motion: cards swap in place.
 */
export function InsightReel({
  heading = "Insights",
  insights = DEFAULT_INSIGHTS,
  onFollowUp,
  className,
}: InsightReelProps) {
  const motionSafe = useMotionSafe();
  const [index, setIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(1);
  const current = insights[index];

  const go = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  if (!current) return null;

  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="flex items-baseline gap-2">
          <span className="text-label text-ink-3">{heading}</span>
          <span className="rounded-full border border-hairline px-1.5 py-px font-mono text-[10px] text-ink-3">
            {insights.length}
          </span>
        </p>
        <div role="tablist" aria-label="Insight pager" className="flex gap-1.5">
          {insights.map((insight, dotIndex) => (
            <button
              key={insight.id}
              type="button"
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={`Insight ${dotIndex + 1}`}
              onClick={() => go(dotIndex)}
              className={cn(
                "size-2 rounded-full transition-colors",
                dotIndex === index
                  ? "bg-primary"
                  : "bg-surface-2 hover:bg-ink-3",
              )}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-56">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={current.id}
            initial={{
              opacity: 0,
              x: motionSafe ? direction * distances.shift : 0,
            }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: motionSafe ? -direction * distances.shift : 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            <p className="text-sm leading-relaxed text-ink">
              {current.lead}
              {current.subject && (
                <span className="mx-1 inline-flex translate-y-[-1px] items-center rounded-full border border-hairline bg-surface-0 px-1.5 py-px align-middle text-xs font-medium text-ink">
                  {current.subject}
                </span>
              )}
              {current.leadAfter ? ` ${current.leadAfter}` : null}
            </p>

            {current.deltas && (
              <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
                {current.deltas.map((delta) => (
                  <div key={delta.id} className="min-w-0">
                    <dt className="text-label text-ink-3">{delta.label}</dt>
                    <dd className="flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          "font-mono text-sm",
                          delta.tone === "up"
                            ? "text-[var(--success,var(--primary))]"
                            : delta.tone === "down"
                              ? "text-destructive"
                              : "text-ink-2",
                        )}
                      >
                        {delta.primary}
                      </span>
                      {delta.secondary && (
                        <span className="font-mono text-[11px] text-ink-3">
                          {delta.secondary}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {current.series && (
              <div className="mt-3">
                <SparkChart
                  data={current.series}
                  variant="area"
                  height={64}
                  label={current.seriesLabel ?? "Series"}
                />
              </div>
            )}

            {current.followUp && (
              <button
                type="button"
                onClick={() => onFollowUp?.(current.followUp!, current)}
                className="mt-3 rounded-full border border-hairline px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
              >
                {current.followUp}
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
