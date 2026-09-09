"use client";

import * as React from "react";

import { CompareLines, type CompareSeries } from "@/registry/ui/compare-lines";

/** Twenty-four seeded sessions, oldest first. */
const BSN: CompareSeries = {
  id: "bsn",
  label: "Basin BSN",
  points: [
    42.1, 42.35, 42.02, 42.61, 43.04, 42.88, 43.37, 43.75, 43.52, 44.1, 44.46,
    44.21, 44.63, 45.02, 44.71, 45.19, 45.48, 45.12, 45.55, 45.91, 45.64, 46.03,
    45.78, 45.64,
  ],
};

const FRN: CompareSeries = {
  id: "frn",
  label: "Fernwork FRN",
  points: [
    18.35, 18.42, 18.6, 18.51, 18.3, 18.22, 18.44, 18.71, 18.66, 18.9, 19.05,
    18.84, 18.62, 18.49, 18.73, 18.95, 19.12, 18.98, 18.52, 18.4, 18.61, 18.79,
    18.96, 18.92,
  ],
};

const LABELS = BSN.points.map((_, index) => `Day ${index + 1}`);

const percentAt = (series: CompareSeries, index: number) =>
  ((series.points[index] ?? 0) / (series.points[0] ?? 1) - 1) * 100;

const signed = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}`;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CompareLinesDemo() {
  const [generation, setGeneration] = React.useState(0);
  const [cursor, setCursor] = React.useState<number | null>(null);

  const last = BSN.points.length - 1;
  const gap =
    cursor !== null ? percentAt(BSN, cursor) - percentAt(FRN, cursor) : null;

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <CompareLines
        key={generation}
        label="Basin BSN against Fernwork FRN"
        series={[BSN, FRN]}
        labels={LABELS}
        onCursorChange={setCursor}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setGeneration((current) => current + 1)}
        >
          Redraw
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-cobalt-bright">BSN</span>{" "}
        <span className="tabular-nums">{signed(percentAt(BSN, last))}%</span> ·{" "}
        <span className="text-warn">FRN</span>{" "}
        <span className="tabular-nums">{signed(percentAt(FRN, last))}%</span> ·{" "}
        {cursor !== null && gap !== null ? (
          <span className="text-signal">
            gap <span className="tabular-nums">{signed(gap)}</span> pts at{" "}
            {LABELS[cursor]}
          </span>
        ) : (
          <span className="text-signal">hover for the gap</span>
        )}
      </p>
    </div>
  );
}
