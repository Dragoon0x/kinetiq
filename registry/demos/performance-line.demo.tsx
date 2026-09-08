"use client";

import * as React from "react";

import {
  PerformanceLine,
  type PerformancePeriod,
} from "@/registry/ui/performance-line";

/**
 * A seeded walk, built once at module scope: the server and the client draw the
 * same line, and nothing here reads a clock or a random number.
 */
function walk(seed: number, count: number, start: number, drift: number) {
  let state = seed;
  let level = start;
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const noise = (state / 2147483648 - 0.5) * 0.045;
    level = level * (1 + drift + noise);
    out.push(Math.round(level * 100) / 100);
  }
  return out;
}

const PERIODS: PerformancePeriod[] = [
  {
    id: "1m",
    label: "1M",
    since: "8 Aug 2026",
    points: walk(7741, 22, 45200, 0.0012),
  },
  {
    id: "3m",
    label: "3M",
    since: "8 Jun 2026",
    points: walk(2298, 34, 43100, 0.0022),
  },
  {
    id: "1y",
    label: "1Y",
    since: "4 Sep 2025",
    points: walk(5163, 48, 38200, 0.004),
  },
  {
    id: "all",
    label: "All",
    since: "2 Mar 2023",
    points: walk(9014, 60, 24800, 0.0104),
  },
];

export function PerformanceLineDemo() {
  const [periodId, setPeriodId] = React.useState("1y");

  const period = PERIODS.find((item) => item.id === periodId) ?? PERIODS[0]!;
  const open = period.points[0]!;
  const close = period.points[period.points.length - 1]!;
  const change = ((close - open) / open) * 100;

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <PerformanceLine
        label="Waylight Growth"
        periods={PERIODS}
        value={periodId}
        onValueChange={setPeriodId}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Period {period.label} · Return{" "}
        <span className="text-signal tabular-nums">
          {change >= 0 ? "+" : "-"}
          {Math.abs(change).toFixed(2)}%
        </span>{" "}
        since {period.since}
      </p>
    </div>
  );
}
