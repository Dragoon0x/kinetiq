"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GlossaryTerm = {
  id: string;
  term: string;
  definition: string;
  /** What people usually call it elsewhere, so the reader can map it. */
  elsewhere?: string;
};

export type ContentGlossaryProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  terms?: GlossaryTerm[];
  elsewhereLabel?: string;
  className?: string;
};

const DEFAULT_TERMS: GlossaryTerm[] = [
  {
    id: "t1",
    term: "Board",
    definition:
      "One yard's plan for one shift, cut at a moment in time and never edited afterwards. A change produces a new board, not a revision of the old one.",
    elsewhere: "Schedule, plan, run sheet",
  },
  {
    id: "t2",
    term: "Cut",
    definition:
      "The act of producing a board from the constraints as they stand. Boards are cut, not generated — the word is deliberate, because a cut has a moment and an author.",
    elsewhere: "Generate, publish, build",
  },
  {
    id: "t3",
    term: "Constraint",
    definition:
      "Anything that limits what a board may contain: crane windows, crew rest, tide, or a hold a supervisor entered by hand. Constraints are visible on every board they shaped.",
    elsewhere: "Rule, restriction, business logic",
  },
  {
    id: "t4",
    term: "Reshuffle",
    definition:
      "A re-cut caused by something changing mid-shift. It names its cause, and it propagates to every board sharing the constraint that moved.",
    elsewhere: "Re-plan, update, revision",
  },
  {
    id: "t5",
    term: "The record",
    definition:
      "The append-only history of every board cut and every override entered. It is the thing audits are answered from, and nobody — including us — can quietly edit it.",
    elsewhere: "Audit log, history, event store",
  },
];

/**
 * The words this product uses, and what they actually mean — with the term
 * people use elsewhere printed beside each one, so a reader can map their own
 * vocabulary onto yours rather than guessing. Any product with an opinionated
 * vocabulary quietly loses readers who assume a familiar word means the
 * familiar thing; a page that defines its terms costs nothing and stops that
 * happening.
 */
export function ContentGlossary({
  eyebrow = "Waylight · plain definitions",
  headline = "Five words we use carefully.",
  copy = "We are precise about these because the precision is the product. Where our word differs from the usual one, the usual one is printed beside it.",
  terms = DEFAULT_TERMS,
  elsewhereLabel = "Elsewhere",
  className,
}: ContentGlossaryProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(terms.length);

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

        <dl className="mt-12 flex flex-col">
          {terms.map((entry, index) => (
            <motion.div
              key={entry.id}
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
              className="grid gap-x-8 gap-y-2 border-t border-hairline py-6 sm:grid-cols-[10rem_minmax(0,1fr)]"
            >
              <dt className="min-w-0">
                <span className="block font-semibold tracking-tight text-ink">
                  {entry.term}
                </span>
                {entry.elsewhere && (
                  <span className="mt-1.5 block">
                    <span className="block text-label text-ink-3">
                      {elsewhereLabel}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-3">
                      {entry.elsewhere}
                    </span>
                  </span>
                )}
              </dt>
              <dd className="min-w-0 leading-relaxed text-ink-2">
                {entry.definition}
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
