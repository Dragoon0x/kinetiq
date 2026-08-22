"use client";

import * as React from "react";

import { Readout } from "@/registry/ui/readout";
import { TickerTape } from "@/registry/ui/ticker-tape";
import { cn } from "@/registry/lib/utils";

export type EvidenceBandProps = {
  /** The one metric the band leads with. */
  metric?: { value: number; suffix?: string; label: string };
  /** The one voice. */
  quote?: { text: string; cite: string };
  /** The marks on the rail. */
  marks?: string[];
  className?: string;
};

const DEFAULT_MARKS = [
  "Fieldline",
  "RELAY",
  "Basinworks",
  "KEEPER",
  "Switchyard",
  "Ovenword",
  "FERRITE",
  "Waylight",
];

/**
 * Social proof as one mixed band — a metric, a voice, and the marks —
 * because separately each is owned ground, and together they make the one
 * argument none makes alone: many teams, measured results, in their own
 * words. The metric rolls in on the readout, the marks ride the tape, and
 * the quote just sits there being true.
 */
export function ProofEvidenceBand({
  metric = { value: 1180, suffix: "+", label: "crews planned through it daily" },
  quote = {
    text: "It is the first tool the yard reads before the shift instead of after something goes wrong.",
    cite: "M. Aldana — yard lead",
  },
  marks = DEFAULT_MARKS,
  className,
}: EvidenceBandProps) {
  return (
    <section
      aria-label="Proof"
      className={cn("bg-surface-0 border-hairline relative border-y", className)}
    >
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-6 py-14 sm:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <div>
          <p className="flex items-baseline">
            <Readout
              value={metric.value}
              size="xl"
              format={(v) => v.toLocaleString("en-US")}
            />
            {metric.suffix && (
              <span className="text-ink font-mono text-4xl font-semibold">
                {metric.suffix}
              </span>
            )}
          </p>
          <p className="text-ink-3 mt-2 text-sm">{metric.label}</p>
        </div>

        <figure className="border-hairline lg:border-l lg:pl-10">
          <blockquote className="text-ink text-lg leading-relaxed text-balance sm:text-xl">
            “{quote.text}”
          </blockquote>
          <figcaption className="text-ink-3 mt-3 font-mono text-[10px] tracking-[0.08em] uppercase">
            {quote.cite}
          </figcaption>
        </figure>
      </div>

      <div aria-hidden className="border-hairline border-t py-5 select-none">
        <TickerTape speed={26} gap={12}>
          {marks.map((mark) => (
            <span
              key={mark}
              className={cn(
                "text-ink-3 px-6 text-lg font-semibold tracking-tight whitespace-nowrap opacity-70",
                mark === mark.toUpperCase() && "font-mono text-base tracking-[0.14em]",
              )}
            >
              {mark}
            </span>
          ))}
        </TickerTape>
      </div>
      <p className="sr-only">{marks.join(", ")}</p>
    </section>
  );
}
