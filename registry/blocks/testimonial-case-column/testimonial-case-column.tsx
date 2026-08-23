"use client";

import * as React from "react";

import { BalanceQuote } from "@/registry/ui/balance-quote";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type CaseResult = {
  id: string;
  label: string;
  value: number;
  /** Rendered around the numeral, e.g. "%" or "×". */
  suffix?: string;
  prefix?: string;
};

export type TestimonialCaseColumnProps = {
  eyebrow?: string;
  headline?: string;
  /** Who is speaking, and from where. */
  customer?: string;
  customerNote?: string;
  /** The story, as paragraphs. */
  paragraphs?: string[];
  /** The pull quote, set on the balance instrument. */
  pullQuote?: string;
  pullCite?: string;
  /** Where the pull quote sits in the paragraph run. */
  pullAfter?: number;
  results?: CaseResult[];
  resultsTitle?: string;
  className?: string;
};

const DEFAULT_PARAGRAPHS = [
  "North basin ran on a whiteboard and two radios for eleven years. It worked, in the sense that the ships left. What it cost was the first ninety minutes of every morning, which went to establishing what had actually happened overnight before anyone could decide what to do about it.",
  "The first thing that changed was not the planning. It was that the overnight events — a late barge, a crane held for inspection, a crew short — arrived as rows instead of as rumours. By the time the gate opened, the argument about what was true had already been settled by the record.",
  "The planning changed second, and more slowly. Crews trusted the board about six weeks in, which is roughly when the third or fourth reshuffle propagated correctly without anyone re-keying it. After that the whiteboard stayed up for a month out of superstition, then came down.",
];

const DEFAULT_RESULTS: CaseResult[] = [
  { id: "r1", label: "minutes back per morning", value: 74 },
  { id: "r2", label: "fewer reshuffles re-keyed", value: 91, suffix: "%" },
  { id: "r3", label: "yards on one record", value: 4 },
];

/**
 * One customer, told at length: a single narrow column of narrative with the
 * measured results pinned in the margin and one line lifted out onto the
 * balance instrument. The wall variants prove breadth by counting voices;
 * this one proves depth by staying with a single yard long enough to say what
 * actually changed, and in what order.
 */
export function TestimonialCaseColumn({
  eyebrow = "Waylight · one yard, at length",
  headline = "Eleven years of whiteboard, and the six weeks after.",
  customer = "North Basin Terminal",
  customerNote = "Bulk and project cargo · four yards · 210 crew",
  paragraphs = DEFAULT_PARAGRAPHS,
  pullQuote = "The morning stopped being an investigation and became a decision.",
  pullCite = "M. Aldana — Yard lead, north basin",
  pullAfter = 1,
  results = DEFAULT_RESULTS,
  resultsTitle = "What it moved",
  className,
}: TestimonialCaseColumnProps) {
  const headingId = React.useId();

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
          <p className="mt-4 text-ink-2">
            <span className="font-medium text-ink">{customer}</span>
            <span className="text-ink-3"> — {customerNote}</span>
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_13rem] lg:gap-14">
          {/* The story. */}
          <div className="max-w-prose min-w-0">
            {paragraphs.map((paragraph, index) => (
              <React.Fragment key={paragraph.slice(0, 24)}>
                <p
                  className={cn(
                    "leading-relaxed text-ink-2",
                    index > 0 && "mt-5",
                  )}
                >
                  {paragraph}
                </p>
                {index === pullAfter && pullQuote && (
                  <div className="my-8">
                    <BalanceQuote cite={pullCite}>{pullQuote}</BalanceQuote>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          {/* The margin: what it moved, held beside the story rather than
              stacked on top of it. */}
          <aside className="min-w-0 lg:border-l lg:border-hairline lg:pl-6">
            <p className="text-label text-ink-3">{resultsTitle}</p>
            <dl className="mt-4 grid grid-cols-2 gap-6 lg:grid-cols-1 lg:gap-7">
              {results.map((result) => (
                <div key={result.id} className="min-w-0">
                  <dd className="flex items-baseline gap-0.5">
                    {result.prefix && (
                      <span className="text-lg text-ink-3">
                        {result.prefix}
                      </span>
                    )}
                    <Readout value={result.value} size="lg" />
                    {result.suffix && (
                      <span className="text-lg text-ink-3">
                        {result.suffix}
                      </span>
                    )}
                  </dd>
                  <dt className="mt-1 text-xs leading-snug text-balance text-ink-3">
                    {result.label}
                  </dt>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </div>
    </section>
  );
}
