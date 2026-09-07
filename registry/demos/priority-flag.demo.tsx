"use client";

import * as React from "react";

import { PriorityFlag } from "@/registry/ui/priority-flag";

const SLA = {
  low: { label: "Low", hours: 72 },
  medium: { label: "Medium", hours: 24 },
  high: { label: "High", hours: 8 },
  urgent: { label: "Urgent", hours: 2 },
} as const;

type Level = keyof typeof SLA;

const isLevel = (value: string): value is Level => value in SLA;

export function PriorityFlagDemo() {
  const [level, setLevel] = React.useState<Level>("medium");
  const sla = SLA[level];

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Coldbrook · ticket 4412</span>
        <span className="text-sm">Card reader offline at Pier 3</span>
      </div>

      <PriorityFlag
        label="Priority"
        value={level}
        onValueChange={(next) => {
          if (isLevel(next)) setLevel(next);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {sla.label} · first response{" "}
        <span className="text-signal tabular-nums">{sla.hours}h</span>
      </p>
    </div>
  );
}
