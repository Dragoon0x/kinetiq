"use client";

import * as React from "react";

import { Readout } from "@/registry/ui/readout";
import { SparkChart } from "@/registry/ui/spark-chart";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type ImpactRow = {
  id: string;
  metric: string;
  value: number;
  suffix?: string;
  delta?: { value: string; direction: "up" | "down" };
  /** Twelve points of context drawn beside the number. */
  series: number[];
};

export type StatsImpactReportProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The report's sign-off line. */
  attestation?: string;
  rows?: ImpactRow[];
  className?: string;
};

const DEFAULT_ROWS: ImpactRow[] = [
  {
    id: "routed",
    metric: "Requests routed",
    value: 412_000,
    delta: { value: "+18%", direction: "up" },
    series: [61, 63, 60, 66, 70, 68, 74, 78, 77, 84, 88, 95],
  },
  {
    id: "first-touch",
    metric: "First-touch resolution",
    value: 71,
    suffix: "%",
    delta: { value: "+9pts", direction: "up" },
    series: [52, 54, 55, 58, 57, 60, 63, 64, 66, 68, 70, 71],
  },
  {
    id: "wait",
    metric: "Median wait, minutes",
    value: 6,
    delta: { value: "−11m", direction: "down" },
    series: [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6],
  },
];

/**
 * Stats set as an impact report rather than a dashboard: a narrative column
 * that says what changed and why it matters, beside a ledger of metric rows —
 * each one a rolling numeral, its delta, and a year of context drawn as a
 * spark line right where the claim is made. The attestation line at the base
 * says where the numbers come from, because a stat without provenance is
 * just typography.
 */
export function StatsImpactReport({
  eyebrow = "Switchyard · the year in routing",
  headline = "What a year of better routing added up to.",
  copy = "Twelve months ago every request waited in one queue. This is what moved once requests started landing with the right desk on the first try — measured, not estimated.",
  attestation = "Figures from the routing ledger, full-year window, all desks.",
  rows = DEFAULT_ROWS,
  className,
}: StatsImpactReportProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="max-w-md">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
            <p className="text-ink-3 mt-8 font-mono text-[11px] leading-relaxed tracking-[0.06em] uppercase">
              {attestation}
            </p>
          </div>

          <ul className="border-hairline bg-surface-1 rounded-4 divide-hairline flex flex-col divide-y border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="grid items-center gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)]"
              >
                <div className="min-w-0">
                  <p className="text-ink-3 text-sm">{row.metric}</p>
                  <p className="mt-1.5 flex items-baseline gap-2">
                    <Readout
                      value={row.value}
                      size="md"
                      format={(v) => v.toLocaleString("en-US")}
                    />
                    {row.suffix && (
                      <span className="text-ink font-mono text-xl font-semibold">
                        {row.suffix}
                      </span>
                    )}
                    {row.delta && (
                      <StatusSeal
                        variant={row.delta.direction === "up" ? "success" : "info"}
                        className="ml-1"
                      >
                        {row.delta.value}
                      </StatusSeal>
                    )}
                  </p>
                </div>
                <div className="min-w-0">
                  <SparkChart
                    data={row.series}
                    variant="line"
                    height={56}
                    label={row.metric}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
