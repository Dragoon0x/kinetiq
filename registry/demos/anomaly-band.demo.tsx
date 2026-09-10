"use client";

import * as React from "react";

import { AnomalyBand, type BandPoint } from "@/registry/ui/anomaly-band";

const TIMES = [
  "09:00",
  "09:15",
  "09:30",
  "09:45",
  "10:00",
  "10:15",
  "10:30",
  "10:45",
  "11:00",
  "11:15",
  "11:30",
  "11:45",
  "12:00",
  "12:15",
];

/** Two seeded windows of gate-relay settle latency. Ids stay stable, so a
 *  selected reading survives the swap; nothing here reads a clock. */
const build = (values: number[]): BandPoint[] =>
  values.map((value, index) => ({
    id: `r${index}`,
    at: TIMES[index] ?? "",
    value,
  }));

const MORNING = build([46, 49, 47, 51, 48, 44, 50, 49, 46, 52, 47, 45, 88, 49]);

const DRIFT = build([44, 45, 46, 44, 45, 47, 46, 45, 44, 46, 45, 47, 88, 84]);

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AnomalyBandDemo() {
  const [drift, setDrift] = React.useState(false);
  const [sigma, setSigma] = React.useState(2);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [outliers, setOutliers] = React.useState(0);

  const series = drift ? DRIFT : MORNING;
  const chosen = series.find((point) => point.id === selected);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AnomalyBand
        label="gate-relay settle latency"
        series={series}
        sigma={sigma}
        selectedId={selected}
        onSelectedChange={setSelected}
        onOutliersChange={setOutliers}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setDrift((was) => !was)}
        >
          {drift ? "Morning window" : "Next window"}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setSigma((current) => (current === 2 ? 3 : 2))}
        >
          {sigma === 2 ? "Widen band" : "Tighten band"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Window {drift ? 2 : 1} of 2 · ±{sigma}σ ·{" "}
        <span className="tabular-nums">{outliers}</span> outside ·{" "}
        <span className="text-signal">
          {chosen ? `${chosen.at} selected` : "none selected"}
        </span>
      </p>
    </div>
  );
}
