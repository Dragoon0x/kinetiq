"use client";

import * as React from "react";

import { CadencePick, type Cadence } from "@/registry/ui/cadence-pick";

const NEXT_RUN: Record<Exclude<Cadence, "custom">, string> = {
  daily: "tomorrow 07:00",
  weekly: "Wednesday 07:00",
  monthly: "the 1st, 07:00",
};

export function CadencePickDemo() {
  const [cadence, setCadence] = React.useState<Cadence>("weekly");
  const [days, setDays] = React.useState(3);

  const handleChange = (next: Cadence, everyDays?: number) => {
    setCadence(next);
    if (everyDays !== undefined) setDays(everyDays);
  };

  const nextRun =
    cadence === "custom" ? `in ${days} days, 07:00` : NEXT_RUN[cadence];

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <CadencePick
        label="Gaugeworks report cadence"
        value={cadence}
        everyDays={days}
        onValueChange={handleChange}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {cadence} · next run {nextRun}
      </p>
    </div>
  );
}
