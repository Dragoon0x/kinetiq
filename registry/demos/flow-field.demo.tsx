"use client";

import { FlowField } from "@/registry/ui/flow-field";

export function FlowFieldDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 overflow-hidden rounded-3 border">
        <FlowField height={260} />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Streaks{" "}
        <span className="text-[var(--signal,var(--primary))]">
          combed by a current
        </span>
      </p>
    </div>
  );
}
