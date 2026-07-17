"use client";

import * as React from "react";

import { RangeDual } from "@/registry/ui/range-dual";

export function RangeDualDemo() {
  const [range, setRange] = React.useState<[number, number]>([2000, 6500]);
  const fmt = (v: number) => `$${v.toLocaleString()}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RangeDual
        value={range}
        onValueChange={setRange}
        min={0}
        max={10000}
        step={100}
        format={fmt}
        labels={["Minimum price", "Maximum price"]}
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Range{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {fmt(range[0])} – {fmt(range[1])}
        </span>
      </p>
    </div>
  );
}
