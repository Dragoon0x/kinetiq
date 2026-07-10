"use client";

import * as React from "react";

import { MatrixRise } from "@/registry/ui/matrix-rise";

const HOURS = ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"];
const ZONES = ["ZONE A", "ZONE B", "ZONE C", "ZONE D", "ZONE E", "ZONE F"];

/**
 * Deterministic 6x6 load — a pure formula of (r, c), no RNG. Two peaks (a
 * midday surge centered near zone C and an evening surge near zone E) laid
 * over a shallow base load, so the risen city reads as two clusters of
 * taller bars rather than a flat plateau or noise.
 */
function loadAt(r: number, c: number): number {
  const base = 14 + r * 1.5;
  const dayPeak = 46 * Math.exp(-((r - 2) ** 2 + (c - 2) ** 2) / 5);
  const eveningPeak = 34 * Math.exp(-((r - 4) ** 2 + (c - 4.5) ** 2) / 4);
  return Math.round((base + dayPeak + eveningPeak) * 10) / 10;
}

const DATA: number[][] = HOURS.map((_, r) => ZONES.map((_, c) => loadAt(r, c)));

export function MatrixRiseDemo() {
  const [risen, setRisen] = React.useState(false);

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">LOAD MATRIX &middot; 6x6</p>
          <p className="text-label text-ink-3">KQ-150</p>
        </div>

        <MatrixRise
          data={DATA}
          rowLabels={HOURS}
          colLabels={ZONES}
          defaultRisen={false}
          onToggle={setRisen}
          height={300}
          aria-label="Zone load matrix, six hours by six zones"
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          VIEW &middot;{" "}
          <span className="text-cobalt-bright">
            {risen ? "BAR CITY" : "HEAT GRID"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Toggle to raise the grid into a city of bars.
        </p>
      </div>
    </div>
  );
}
