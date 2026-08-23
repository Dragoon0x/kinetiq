"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";

export type LastWordEntry = {
  id: string;
  question: string;
  answer: string;
};

export type FaqLastWordProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  entries?: LastWordEntry[];
  className?: string;
};

const DEFAULT_ENTRIES: LastWordEntry[] = [
  {
    id: "q1",
    question: "What are you actually selling?",
    answer:
      "A morning that runs on a shared record instead of radio and memory. The software is the medium; the product is the argument you stop having.",
  },
  {
    id: "q2",
    question: "Why would this work where the last tool didn't?",
    answer:
      "Because it starts at the gate, not the office. The board is built for gloves and glare, and the office views are derived from what the yard already touched.",
  },
  {
    id: "q3",
    question: "What breaks if we stop paying?",
    answer:
      "Nothing retroactively. Exports keep working, history stays yours, and the free tier keeps a single yard running. Leaving is a workflow, not a hostage exchange.",
  },
  {
    id: "q4",
    question: "What is this bad at?",
    answer:
      "Long-horizon planning. Waylight is a morning instrument — quarters and budgets live better in the tools you already have, and we integrate instead of pretending.",
  },
];

/**
 * The questions answered in full sentences, no drawers to open: an editorial
 * FAQ set as a two-column read, ending on the question most FAQs avoid —
 * what is this bad at. Everything visible at once, because a page late enough
 * to hold a FAQ owes the reader answers, not another interaction.
 */
export function FaqLastWord({
  eyebrow = "Waylight · plainly",
  headline = "The last four questions, answered whole.",
  copy = "No drawers, no search. These are the ones people actually ask on calls, answered the way we answer them there.",
  entries = DEFAULT_ENTRIES,
  className,
}: FaqLastWordProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
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
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {entries.map((entry, index) => (
            <div key={entry.id}>
              <dt className="flex items-baseline gap-3">
                <span aria-hidden className="text-ink-3 font-mono text-[10px]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-ink text-lg font-semibold tracking-tight">
                  {entry.question}
                </span>
              </dt>
              <dd className="text-ink-2 mt-2.5 leading-relaxed">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
