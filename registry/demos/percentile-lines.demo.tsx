"use client";

import * as React from "react";

import {
  PercentileLines,
  type BandReading,
  type PercentileSeries,
} from "@/registry/ui/percentile-lines";

/** Coldbrook / ledger-api, twelve seeded five-minute samples from 09:00. */
const SAMPLES = [
  "09:00",
  "09:05",
  "09:10",
  "09:15",
  "09:20",
  "09:25",
  "09:30",
  "09:35",
  "09:40",
  "09:45",
  "09:50",
  "09:55",
];

const SERIES: PercentileSeries[] = [
  {
    id: "p50",
    label: "p50",
    values: [46, 44, 47, 52, 58, 61, 57, 54, 49, 47, 45, 44],
  },
  {
    id: "p95",
    label: "p95",
    values: [128, 124, 132, 156, 184, 212, 196, 168, 148, 138, 132, 126],
  },
  {
    id: "p99",
    label: "p99",
    values: [206, 198, 214, 268, 322, 388, 356, 296, 252, 232, 218, 210],
  },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function PercentileLinesDemo() {
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [band, setBand] = React.useState<BandReading | null>(null);

  const shown = SERIES.length - hidden.length;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <PercentileLines
        label="ledger-api"
        series={SERIES}
        samples={SAMPLES}
        hidden={hidden}
        onHiddenChange={setHidden}
        onBandChange={setBand}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() =>
            setHidden(hidden.includes("p99") ? [] : [...hidden, "p99"])
          }
        >
          {hidden.includes("p99") ? "Show p99" : "Hide p99"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={hidden.length === 0}
          onClick={() => setHidden([])}
        >
          Show all
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {band ? `${band.fromId} → ${band.toId}` : "p95 max 212 ms"}
        </span>
        {band
          ? ` · +${band.spread} ms at the widest`
          : ` · ${shown} of ${SERIES.length} shown`}
      </p>
    </div>
  );
}
