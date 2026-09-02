"use client";

import * as React from "react";

import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeskTally = { id: string; label: string; value: number };

export type EmptyClearedDeskProps = {
  headline?: string;
  copy?: string;
  /** What the emptiness cost to earn. */
  tally?: DeskTally[];
  /** The stamp: when it cleared. */
  clearedAt?: string;
  cta?: string;
  onCta?: () => void;
  /** The quieter option, as an inline text link. */
  altLabel?: string;
  onAlt?: () => void;
  /** Optional illustration seated above the copy. Decorative — keep it aria-hidden. */
  art?: React.ReactNode;
  className?: string;
};

const DEFAULT_TALLY: DeskTally[] = [
  { id: "cleared", label: "cleared today", value: 34 },
  { id: "handed", label: "handed on", value: 6 },
  { id: "tomorrow", label: "waiting for tomorrow", value: 0 },
];

/**
 * The empty state you earn rather than the one you arrive in: nothing is
 * left, and the section says so calmly — a tally of what it took, the time it
 * cleared, and one quiet way onward. Deliberately no celebration; the reward
 * is the emptiness itself, and a desk that cheers every time it clears stops
 * meaning anything by Thursday.
 */
export function EmptyClearedDesk({
  headline = "Nothing left on the desk.",
  copy = "Every item on today's board is closed or handed on. The queue will refill at six tomorrow — until then this page has nothing to show you, which is the point.",
  tally = DEFAULT_TALLY,
  clearedAt = "cleared 17:04",
  cta = "Review the day",
  onCta,
  altLabel = "or leave it",
  onAlt,
  art,
  className,
}: EmptyClearedDeskProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(tally.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-xl px-6 py-24 text-center sm:py-32">
        {art ? (
          <div aria-hidden className="mb-6 flex justify-center">
            {art}
          </div>
        ) : null}
        <StatusSeal variant="success">{clearedAt}</StatusSeal>

        <h2
          id={headingId}
          className="mt-6 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {headline}
        </h2>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-ink-2">
          {copy}
        </p>

        {/* The desk edge: the tally sits on a single hairline and nothing more. */}
        <dl className="mx-auto mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-hairline pt-6">
          {tally.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="min-w-0"
            >
              <dt className="sr-only">{entry.label}</dt>
              <dd className="flex flex-col items-center gap-1">
                <Readout value={entry.value} size="lg" />
                <span className="text-label leading-tight text-balance text-ink-3">
                  {entry.label}
                </span>
              </dd>
            </motion.div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <PressureButton onClick={onCta}>{cta}</PressureButton>
          <button
            type="button"
            onClick={onAlt}
            className="text-sm text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
          >
            {altLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
