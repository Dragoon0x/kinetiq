"use client";

import * as React from "react";

import { SHRINK_BAR_HEIGHT, ShrinkBar } from "@/registry/ui/shrink-bar";

const STATS = [
  { label: "Runs", value: "1,204" },
  { label: "Drift", value: "0.4%" },
  { label: "Benches", value: "6" },
];

const NOTES = [
  "The north bench was recut in March and has held calibration since; its sweep sheets are filed against run 118.",
  "Depot handovers move at 06:00. Crates leave with their drift figures attached, signed for at the gate.",
  "Kettle point runs second shift. Its clamps are torqued in pairs so the plate never carries load on one side.",
  "Cold sweeps are kept for a year. Anything outside the band is re-swept before the run is closed out.",
];

export function ShrinkBarDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [percent, setPercent] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-border bg-card">
        <div
          ref={frame}
          className="h-[300px] overflow-y-auto px-4 pb-4"
          style={{ paddingTop: SHRINK_BAR_HEIGHT.rest }}
        >
          <div className="flex gap-2">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-1 flex-col items-center gap-0.5 rounded-2 border border-hairline bg-surface-0 p-2"
              >
                <span className="font-mono text-sm text-foreground tabular-nums">
                  {stat.value}
                </span>
                <span className="text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {NOTES.map((note) => (
              <p key={note.slice(0, 16)} className="text-sm text-ink-2">
                {note}
              </p>
            ))}
          </div>
        </div>

        <ShrinkBar
          container={frame}
          title="Fernworks"
          subtitle="North basin · since 2019"
          onCompactionChange={setPercent}
          actions={
            <button
              type="button"
              className="flex h-8 cursor-pointer items-center rounded-full border border-hairline-strong px-3 text-xs font-medium text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Follow
            </button>
          }
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Compaction{" "}
        <span className="text-[var(--signal,var(--primary))]">{percent}%</span>
      </p>
    </div>
  );
}
