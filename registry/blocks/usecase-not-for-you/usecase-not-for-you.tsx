"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FitCase = {
  id: string;
  /** Who this is, in one line. */
  who: string;
  /** Why it fits, or why it does not — said plainly either way. */
  why: string;
  /** Where to go instead, for the ones it does not fit. */
  instead?: string;
};

export type UsecaseNotForYouProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  forTitle?: string;
  notForTitle?: string;
  goodFits?: FitCase[];
  badFits?: FitCase[];
  /** The line that makes the honesty land rather than read as modesty. */
  closingLine?: string;
  className?: string;
};

const DEFAULT_GOOD: FitCase[] = [
  {
    id: "g1",
    who: "A yard where the morning is decided at the gate",
    why: "Everything here starts from the board a crew reads in gloves. That is the whole design.",
  },
  {
    id: "g2",
    who: "Two to twelve crews sharing constrained gear",
    why: "One crane, two yards, and a reshuffle that has to reach both — this is the case the scheduler was written for.",
  },
  {
    id: "g3",
    who: "Anyone answering audits from memory",
    why: "Shifts close into a record you can quote, so a review stops being an archaeology project.",
  },
];

const DEFAULT_BAD: FitCase[] = [
  {
    id: "b1",
    who: "A single operator with a notebook",
    why: "You would spend more time telling Waylight what you are doing than doing it. The notebook is genuinely better.",
    instead: "Come back at your third crew.",
  },
  {
    id: "b2",
    who: "Anyone planning quarters rather than mornings",
    why: "Waylight has no opinion beyond about ten days out. It is an instrument for the shift, not for the budget.",
    instead: "Keep your planning tool; we integrate with it.",
  },
  {
    id: "b3",
    who: "A yard that needs the plan to be unarguable",
    why: "Ours prints its reasoning and invites the argument. If you want an instruction nobody questions, this is the wrong shape entirely.",
    instead: "You want a dispatch system, not a scheduler.",
  },
];

/**
 * The use-case section that also says who it is not for — and sends those
 * readers somewhere else by name. Pages that only list good fits leave the
 * reader to work out the bad ones alone, usually after a trial and a
 * disappointment. Naming the misfits costs a small number of unqualified
 * signups and buys every remaining claim on the page its credibility.
 */
export function UsecaseNotForYou({
  eyebrow = "Waylight · fit",
  headline = "Who this is for, and who it is not.",
  copy = "Both lists are real. The second one cost us three deals last year and saved us six refunds, which we consider a good trade.",
  forTitle = "Built for",
  notForTitle = "Not for",
  goodFits = DEFAULT_GOOD,
  badFits = DEFAULT_BAD,
  closingLine = "If you are on the right and think we are wrong about you, say so — we have been wrong before, and we would rather hear it now than after you have paid.",
  className,
}: UsecaseNotForYouProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(Math.max(goodFits.length, badFits.length));

  const column = (title: string, cases: FitCase[], fits: boolean) => (
    <div className="min-w-0">
      <p
        className={cn(
          "border-b pb-2 text-label",
          fits
            ? "border-[var(--success,var(--primary))]/40 text-[var(--success,var(--primary))]"
            : "border-hairline-strong text-ink-3",
        )}
      >
        {title}
      </p>
      <ul className="mt-5 flex flex-col gap-6">
        {cases.map((item, index) => (
          <motion.li
            key={item.id}
            initial={{
              opacity: motionSafe ? 0 : 1,
              y: motionSafe ? distances.nudge : 0,
            }}
            whileInView={{ opacity: 1, y: 0 }}
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
            className="min-w-0"
          >
            <p className={cn("font-medium", fits ? "text-ink" : "text-ink-2")}>
              {item.who}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
              {item.why}
            </p>
            {item.instead && (
              <p className="mt-2 font-mono text-[11px] tracking-[0.04em] text-ink-2">
                → {item.instead}
              </p>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );

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

        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-14">
          {column(forTitle, goodFits, true)}
          {column(notForTitle, badFits, false)}
        </div>

        {closingLine && (
          <p className="mt-12 max-w-2xl border-t border-hairline pt-6 leading-relaxed text-ink-2">
            {closingLine}
          </p>
        )}
      </div>
    </section>
  );
}
