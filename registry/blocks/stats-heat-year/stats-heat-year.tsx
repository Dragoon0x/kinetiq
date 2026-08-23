"use client";

import * as React from "react";

import { HeatCalendar, type HeatDay } from "@/registry/ui/heat-calendar";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type YearFigure = { value: number; suffix?: string; label: string };

export type StatsHeatYearProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  days?: HeatDay[];
  unit?: string;
  figures?: YearFigure[];
  /** The provenance line under the grid. */
  attestation?: string;
  className?: string;
};

/** 26 weeks, deterministic: a weekday-heavy rhythm with a mid-year push. */
const DEFAULT_DAYS: HeatDay[] = Array.from({ length: 182 }, (_, i) => {
  const weekday = i % 7;
  const weekend = weekday >= 5;
  const push = i > 84 && i < 126 ? 3 : 0;
  const base = weekend ? 0 : 2 + ((i * 5) % 4);
  return {
    date: `Day ${i + 1}`,
    count: weekend && push === 0 ? (i % 14 === 6 ? 1 : 0) : base + push,
  };
});

const DEFAULT_FIGURES: YearFigure[] = [
  { value: 623, label: "runs logged" },
  { value: 41, label: "of them on the busiest week" },
  { value: 0, label: "days lost to the tool itself" },
];

/**
 * Half a year of work as weather: the library's heat calendar draws the
 * rhythm — weekday rows, a visible mid-season push, honest quiet weekends —
 * with the summary numbers rolling in beside it. The grid answers the
 * question a total can't: not how much, but when, and how steadily.
 */
export function StatsHeatYear({
  eyebrow = "Fieldline · the half-year",
  headline = "Steady is the feature.",
  copy = "Twenty-six weeks of bench activity. The push in the middle is the Meridian launch; the quiet columns are weekends, kept quiet.",
  days = DEFAULT_DAYS,
  unit = "runs",
  figures = DEFAULT_FIGURES,
  attestation = "Counted from the run ledger, all benches, no smoothing.",
  className,
}: StatsHeatYearProps) {
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

        <div className="border-hairline bg-surface-1 rounded-4 mt-10 border p-5 shadow-raised sm:p-6">
          <HeatCalendar days={days} unit={unit} />
        </div>

        <div className="mt-8 flex flex-wrap items-baseline gap-x-12 gap-y-4">
          {figures.map((figure) => (
            <p key={figure.label} className="flex items-baseline gap-2">
              <span className="text-ink flex items-baseline font-mono text-2xl font-semibold">
                <Readout
                  value={figure.value}
                  size="lg"
                  format={(v) => v.toLocaleString("en-US")}
                />
                {figure.suffix && <span>{figure.suffix}</span>}
              </span>
              <span className="text-ink-3 text-sm">{figure.label}</span>
            </p>
          ))}
        </div>

        <p className="text-ink-3 mt-6 font-mono text-[11px] tracking-[0.08em] uppercase">
          {attestation}
        </p>
      </div>
    </section>
  );
}
