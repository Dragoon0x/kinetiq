"use client";

import * as React from "react";

import { BudgetBar, type BudgetSegment } from "@/registry/ui/budget-bar";

const money = (value: number) =>
  `$${Math.round(value).toLocaleString("en-US")}`;

/** Fixed chart art — six hues that stay distinct on both themes. */
const SEGMENTS: BudgetSegment[] = [
  {
    id: "salaries",
    label: "Salaries",
    value: 18400,
    color: "oklch(0.62 0.2 262)",
  },
  { id: "cloud", label: "Cloud", value: 7350, color: "oklch(0.72 0.15 162)" },
  {
    id: "tooling",
    label: "Tooling",
    value: 3120,
    color: "oklch(0.74 0.19 350)",
  },
  { id: "travel", label: "Travel", value: 2480, color: "oklch(0.78 0.15 52)" },
  {
    id: "hardware",
    label: "Hardware",
    value: 1650,
    color: "oklch(0.8 0.14 190)",
  },
  {
    id: "training",
    label: "Training",
    value: 980,
    color: "oklch(0.68 0.18 300)",
  },
];

export function BudgetBarDemo() {
  const [reading, setReading] = React.useState<BudgetSegment | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BudgetBar
        label="Gaugeworks · June"
        segments={SEGMENTS}
        format={money}
        onActiveChange={setReading}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading
          ? `${reading.label} · ${money(reading.value)}`
          : "Read a segment with the pointer or the arrow keys"}
      </p>
    </div>
  );
}
