"use client";

import * as React from "react";

import { DeltaTile } from "@/registry/ui/delta-tile";

/** A 32-bit LCG — seeded, so every month reads the same after hydration. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Twelve points that trend by `drift` with a fixed wobble on top. */
function buildSeries(seed: number, base: number, drift: number): number[] {
  const next = seeded(seed);
  return Array.from({ length: 12 }, (_, i) => {
    const trend = base * (1 + (drift * i) / 11);
    return Math.round(trend * (0.95 + next() * 0.1) * 100) / 100;
  });
}

const money = (value: number) =>
  `$${Math.round(value).toLocaleString("en-US")}`;
const people = (value: number) => Math.round(value).toLocaleString("en-US");
const rate = (value: number) => `${value.toFixed(1)}%`;

const METRICS = [
  { label: "Revenue", seed: 3312, base: 38200, drift: 0.24, format: money },
  {
    label: "Active users",
    seed: 7719,
    base: 12400,
    drift: 0.16,
    format: people,
  },
  {
    label: "Churn",
    seed: 5540,
    base: 3.6,
    drift: -0.3,
    format: rate,
    lowerIsBetter: true,
  },
];

const MONTHS = ["April", "May", "June", "July"];

/**
 * Every frame is precomputed, one more than there are months: frame 0 is the
 * period before April, so the first tile already has a delta to show.
 */
const FRAMES = METRICS.map((metric) =>
  Array.from({ length: MONTHS.length + 1 }, (_, frame) =>
    buildSeries(
      metric.seed + frame * 101,
      metric.base * (1 + frame * 0.07),
      metric.drift,
    ),
  ),
);

const last = (points: number[]) => points[points.length - 1] ?? 0;

export function DeltaTileDemo() {
  const [month, setMonth] = React.useState(0);

  const tiles = METRICS.map((metric, index) => {
    const frames = FRAMES[index] ?? [];
    const series = frames[month + 1] ?? [];
    const prior = frames[month] ?? series;
    return { metric, series, value: last(series), previous: last(prior) };
  });

  const reading = tiles
    .map(({ metric, value, previous }) => {
      const change = previous === 0 ? 0 : ((value - previous) / previous) * 100;
      return `${metric.label} ${change >= 0 ? "+" : "-"}${Math.abs(change).toFixed(1)}%`;
    })
    .join(" · ");

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {tiles.map(({ metric, series, value, previous }) => (
        <DeltaTile
          key={metric.label}
          label={metric.label}
          value={value}
          previous={previous}
          series={series}
          format={metric.format}
          lowerIsBetter={metric.lowerIsBetter}
        />
      ))}

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          {MONTHS[month]}
        </span>
        <button
          type="button"
          onClick={() => setMonth((current) => (current + 1) % MONTHS.length)}
          className="flex h-9 shrink-0 cursor-pointer items-center rounded-2 border border-hairline bg-surface-2 px-3 text-sm font-medium text-foreground outline-none hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Load next month
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {MONTHS[month]} · {reading}
      </p>
    </div>
  );
}
