"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MarginPassage = {
  id: string;
  text: string;
  /** The annotation for this paragraph, set in the margin beside it. */
  note?: { label: string; body: string };
};

export type ContentMarginNotesProps = {
  eyebrow?: string;
  headline?: string;
  standfirst?: string;
  passages?: MarginPassage[];
  /** Signed at the foot, like a document rather than a page. */
  signature?: string;
  className?: string;
};

const DEFAULT_PASSAGES: MarginPassage[] = [
  {
    id: "p1",
    text: "We publish the scheduler's assumptions because a plan you cannot argue with is a plan you cannot trust. Every board Waylight cuts carries the constraints it was cut under, in plain language, at the top of the sheet.",
    note: {
      label: "Constraints, plainly",
      body: "Crane windows, crew rest, tide, and any hold a supervisor entered by hand — never a weighting nobody can see.",
    },
  },
  {
    id: "p2",
    text: "When the plan changes, it says why. A reshuffle that cannot name its cause is withheld and flagged for a human instead of published, which happens about once a fortnight and is the feature working, not failing.",
    note: {
      label: "Withheld, not guessed",
      body: "Roughly 1 in 340 reshuffles. The yard sees a flag; nobody sees a plan we cannot explain.",
    },
  },
  {
    id: "p3",
    text: "None of this makes the scheduler smarter. It makes it accountable, which in a yard is worth considerably more — a crew will work around a constraint they understand and will quietly ignore an instruction they do not.",
  },
  {
    id: "p4",
    text: "That is the whole design brief, and it is why the product looks like an instrument rather than an assistant. Instruments show their reading and let you decide.",
    note: {
      label: "The brief",
      body: "Written on the first morning, unchanged since.",
    },
  },
];

/**
 * An editorial passage with its annotations in the margin, aligned to the
 * paragraph each one belongs to — the shape of a marked-up document rather
 * than a marketing page. Nothing pops or reveals: the notes are simply there,
 * beside the sentence they qualify, which is what makes a claim readable as
 * argument instead of assertion. Below the margin breakpoint the notes fold
 * in under their paragraph, still attached.
 */
export function ContentMarginNotes({
  eyebrow = "Waylight · design notes",
  headline = "A plan you cannot argue with is a plan you cannot trust.",
  standfirst = "Why the scheduler shows its constraints, and what happens on the fortnightly morning when it cannot explain itself.",
  passages = DEFAULT_PASSAGES,
  signature = "M. Aldana — Founder",
  className,
}: ContentMarginNotesProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(passages.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">
            {standfirst}
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-8 border-t border-hairline pt-10">
          {passages.map((passage, index) => (
            <motion.div
              key={passage.id}
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
              className="group/passage grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-10"
            >
              <p className="max-w-prose min-w-0 leading-relaxed text-ink-2">
                {passage.text}
              </p>
              {passage.note ? (
                <aside className="min-w-0 border-l border-hairline pl-4 lg:border-l-0 lg:pl-0">
                  <p className="text-label text-ink-3 transition-colors group-hover/passage:text-ink-2">
                    {passage.note.label}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-3 transition-colors group-hover/passage:text-ink-2">
                    {passage.note.body}
                  </p>
                </aside>
              ) : (
                <span aria-hidden className="hidden lg:block" />
              )}
            </motion.div>
          ))}
        </div>

        <p className="mt-10 border-t border-hairline pt-6 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          {signature}
        </p>
      </div>
    </section>
  );
}
