"use client";

import * as React from "react";

import {
  RangeHistogram,
  type HistogramBin,
} from "@/registry/ui/range-histogram";

/**
 * Twenty-four $100 bands of Basinworks rents. The shape is a closed formula,
 * so the server and the client draw exactly the same histogram.
 */
const BINS: HistogramBin[] = Array.from({ length: 24 }, (_, index) => {
  const from = 800 + index * 100;
  const peak = Math.exp(-((index - 9) ** 2) / 60);
  const texture = 1 + 0.3 * Math.sin(index * 1.7);
  return {
    from,
    to: from + 100,
    count: Math.max(2, Math.round(140 * peak * texture)),
  };
});

const TOTAL = BINS.reduce((sum, bin) => sum + bin.count, 0);

const money = (value: number) =>
  `$${Math.round(value).toLocaleString("en-US")}`;

export function RangeHistogramDemo() {
  const [range, setRange] = React.useState<[number, number]>([1200, 2400]);

  const matches = BINS.reduce((sum, bin) => {
    const mid = (bin.from + bin.to) / 2;
    return mid >= range[0] && mid <= range[1] ? sum + bin.count : sum;
  }, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RangeHistogram
        bins={BINS}
        value={range}
        onValueChange={setRange}
        format={money}
        label="Basinworks rent"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {money(range[0])} – {money(range[1])} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">{matches}</span>{" "}
        of {TOTAL} homes
      </p>
    </div>
  );
}
