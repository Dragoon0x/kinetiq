"use client";

import * as React from "react";

import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type PassageFigure = {
  value: number;
  suffix?: string;
  label: string;
};

export type ContentFieldPassageProps = {
  kicker?: string;
  headline?: string;
  /** The passage, one paragraph per entry. */
  paragraphs?: string[];
  /** The pull figure set beside the prose. */
  figure?: PassageFigure;
  /** The passage's sign-off. */
  byline?: string;
  className?: string;
};

const DEFAULT_PARAGRAPHS = [
  "The yard at Kettle Point ran on radio and memory for thirty years. Plans were made at the gate, changed by shout, and reconstructed at the end of the week from whoever's notebook had survived the rain.",
  "The first month of running the morning on a shared ledger did not feel like software. It felt like the arguments getting shorter. A crane delay stopped being a negotiation and became a row everyone could see move.",
  "The number that convinced the region was not throughput. It was the hour — the one every yard lead got back between the gate opening and the first real decision, every single morning.",
];

/**
 * An editorial passage with one figure doing the arguing: prose set at
 * reading measure, and beside it a single pull stat on the rolling readout —
 * large, sourced, and unhurried. Content sections earn their place by being
 * readable; the only motion here is the number arriving.
 */
export function ContentFieldPassage({
  kicker = "FROM THE FIELD · KETTLE POINT",
  headline = "The hour the morning gave back.",
  paragraphs = DEFAULT_PARAGRAPHS,
  figure = { value: 214, label: "mornings on the ledger, and counting" },
  byline = "Field notes, north region",
  className,
}: ContentFieldPassageProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
          <article className="max-w-2xl">
            <p className="text-label text-ink-3">{kicker}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <div className="mt-6 flex flex-col gap-5">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)} className="text-ink-2 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
            <p className="text-ink-3 mt-8 font-mono text-[11px] tracking-[0.08em] uppercase">
              — {byline}
            </p>
          </article>

          <aside className="border-hairline bg-surface-1 rounded-4 border p-8 text-center lg:sticky lg:top-24">
            <p className="flex items-baseline justify-center">
              <Readout
                value={figure.value}
                size="xl"
                format={(v) => v.toLocaleString("en-US")}
              />
              {figure.suffix && (
                <span className="text-ink font-mono text-4xl font-semibold">
                  {figure.suffix}
                </span>
              )}
            </p>
            <p className="text-ink-3 mt-3 text-sm leading-relaxed">{figure.label}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
