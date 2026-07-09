"use client";

import * as React from "react";

import { ActivityRings, type ActivityRing } from "@/registry/ui/activity-rings";

const STAGES: ActivityRing[] = [
  { value: 1, label: "Build", color: "var(--signal)" },
  { value: 0.82, label: "Tests", color: "oklch(0.7 0.15 45)" },
  { value: 0.64, label: "Deploy", color: "oklch(0.68 0.16 300)" },
];

export function ActivityRingsDemo() {
  const [replay, setReplay] = React.useState(0);

  return (
    <div className="border-border bg-card flex w-full max-w-sm flex-col items-center gap-4 rounded-3 border px-5 py-6">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        Pipeline status
      </span>

      <ActivityRings
        rings={STAGES}
        size={180}
        replayKey={replay}
        aria-label="Pipeline stage completion"
        center={
          <span className="flex flex-col items-center leading-none">
            <span className="text-label text-ink-3">Stages</span>
            <span className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {STAGES.length}
            </span>
          </span>
        }
      />

      <button
        type="button"
        onClick={() => setReplay((k) => k + 1)}
        className="border-input hover:bg-accent h-8 rounded-2 border px-3 text-xs font-medium"
      >
        Replay
      </button>
    </div>
  );
}
