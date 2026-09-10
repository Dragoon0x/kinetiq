"use client";

import * as React from "react";

import { CapacityBar, type SegmentId } from "@/registry/ui/capacity-bar";

/** Three seeded shifts of the Basinworks dock-worker pool, 16 cores. */
const QUIET = { name: "quiet", used: 6.4, reserved: 1.2 };

const SHIFTS = [
  QUIET,
  { name: "busy", used: 9, reserved: 2.4 },
  { name: "drain", used: 12.9, reserved: 2.6 },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function CapacityBarDemo() {
  const [index, setIndex] = React.useState(0);
  const [threshold, setThreshold] = React.useState(0.8);
  const [over, setOver] = React.useState(false);
  const [run, setRun] = React.useState<SegmentId | null>(null);

  const shift = SHIFTS[index] ?? QUIET;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CapacityBar
        label="dock-worker pool"
        used={shift.used}
        reserved={shift.reserved}
        total={16}
        threshold={threshold}
        onThresholdChange={setThreshold}
        onOverChange={setOver}
        onSegmentChange={setRun}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setIndex((current) => (current + 1) % SHIFTS.length)}
        >
          Next shift
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={threshold === 0.8}
          onClick={() => setThreshold(0.8)}
        >
          Reset line
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Shift {shift.name} · line{" "}
        <span className="tabular-nums">{Math.round(threshold * 100)}%</span> ·{" "}
        <span className="text-signal">
          {over ? "over the line" : "within headroom"}
        </span>
        {run ? ` · ${run}` : ""}
      </p>
    </div>
  );
}
