"use client";

import * as React from "react";

import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
  { value: "board", label: "Board" },
] as const;

const RANGES = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

export function SegmentedControlDemo() {
  const [view, setView] = React.useState<string>("grid");
  const [range, setRange] = React.useState<string>("week");

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <SegmentedControl label="View" value={view} onValueChange={setView}>
        {VIEWS.map((option) => (
          <SegmentedControlItem key={option.value} value={option.value}>
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

      <SegmentedControl
        label="Range"
        size="sm"
        value={range}
        onValueChange={setRange}
      >
        {RANGES.map((option) => (
          <SegmentedControlItem key={option.value} value={option.value}>
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        View{" "}
        <span className="text-[var(--signal,var(--primary))]">{view}</span> ·
        Range{" "}
        <span className="text-[var(--signal,var(--primary))]">{range}</span>
      </p>
    </div>
  );
}
