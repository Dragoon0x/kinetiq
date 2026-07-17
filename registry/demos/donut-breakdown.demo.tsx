"use client";

import { DonutBreakdown, type DonutSegment } from "@/registry/ui/donut-breakdown";

const SEGMENTS: DonutSegment[] = [
  { id: "direct", label: "Direct", value: 4200 },
  { id: "search", label: "Search", value: 3100 },
  { id: "social", label: "Social", value: 1800 },
  { id: "referral", label: "Referral", value: 900 },
  { id: "email", label: "Email", value: 540 },
];

export function DonutBreakdownDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DonutBreakdown segments={SEGMENTS} totalLabel="Sessions" />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Hover{" "}
        <span className="text-[var(--signal,var(--primary))]">a slice</span>
      </p>
    </div>
  );
}
