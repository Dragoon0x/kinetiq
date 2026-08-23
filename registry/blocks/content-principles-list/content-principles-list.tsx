"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Principle = {
  id: string;
  title: string;
  copy: string;
  /** What this principle costs us — the line that proves it is a real rule. */
  costsUs?: string;
};

export type ContentPrinciplesListProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  principles?: Principle[];
  costLabel?: string;
  className?: string;
};

const DEFAULT_PRINCIPLES: Principle[] = [
  {
    id: "p1",
    title: "The gate before the office",
    copy: "Every feature is designed for the person standing outside in the weather first, and adapted for the desk afterwards. Never the other way round.",
    costsUs:
      "Office reporting is plainer than our competitors', and that is a choice, not a backlog item.",
  },
  {
    id: "p2",
    title: "A plan that cannot explain itself is not published",
    copy: "The scheduler withholds any board whose reasoning it cannot state, and flags it for a person instead.",
    costsUs:
      "About one morning a fortnight arrives with a flag rather than a plan.",
  },
  {
    id: "p3",
    title: "Leaving is a workflow",
    copy: "Export everything, any time, without asking. Cancellation is a settings page, not a phone call.",
    costsUs:
      "We lose accounts we could have kept by making them hard to leave.",
  },
  {
    id: "p4",
    title: "Small enough to name",
    copy: "You should always be able to find out who made a decision about the product you rely on.",
    costsUs:
      "It caps how fast we can grow, which we have decided we can live with.",
  },
];

/**
 * Operating principles with the price of each one attached. Any company can
 * publish four admirable sentences; a principle only becomes information when
 * it says what it costs the people who wrote it — the office view that stays
 * plain, the mornings that arrive flagged, the customers who leave easily.
 * Without that line this is a values page, and nobody has ever believed one.
 */
export function ContentPrinciplesList({
  eyebrow = "Waylight · how we decide",
  headline = "Four rules, and what each one costs us.",
  copy = "These settle arguments internally. We publish them so you can hold us to them, and so you can tell when we have broken one.",
  principles = DEFAULT_PRINCIPLES,
  costLabel = "What it costs us",
  className,
}: ContentPrinciplesListProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(principles.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
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

        <ol className="mt-12 flex flex-col gap-10">
          {principles.map((principle, index) => (
            <motion.li
              key={principle.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="grid min-w-0 gap-x-6 gap-y-2 sm:grid-cols-[2.5rem_minmax(0,1fr)]"
            >
              <p
                aria-hidden
                className="font-mono text-sm tracking-[0.06em] text-ink-3"
              >
                {String(index + 1).padStart(2, "0")}
              </p>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-tight text-balance text-ink">
                  {principle.title}
                </h3>
                <p className="mt-2 leading-relaxed text-ink-2">
                  {principle.copy}
                </p>
                {principle.costsUs && (
                  <div className="mt-4 border-l-2 border-hairline pl-4">
                    <p className="text-label text-ink-3">{costLabel}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-3">
                      {principle.costsUs}
                    </p>
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
