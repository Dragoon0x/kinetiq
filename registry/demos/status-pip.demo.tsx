"use client";

import * as React from "react";

import { StatusPip, type PipStatus } from "@/registry/ui/status-pip";

const STATUSES: PipStatus[] = ["online", "away", "busy", "offline"];

export function StatusPipDemo() {
  const [status, setStatus] = React.useState<PipStatus>("online");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="border-hairline bg-surface-1 flex items-center gap-3 rounded-3 border p-4">
        <StatusPip status={status} label="Press · Cell 7" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatus(option)}
            className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors"
          >
            {option}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        State{" "}
        <span className="text-[var(--signal,var(--primary))]">{status}</span>
      </p>
    </div>
  );
}
