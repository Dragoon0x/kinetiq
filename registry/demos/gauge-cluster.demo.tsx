"use client";

import * as React from "react";

import { GaugeCluster, type Gauge } from "@/registry/ui/gauge-cluster";

const READINGS: Gauge[][] = [
  [
    { id: "load", label: "Load", value: 58, unit: "%", redline: 85 },
    { id: "core", label: "Core", value: 71, unit: "°", max: 120, redline: 100 },
    { id: "io", label: "I/O", value: 340, unit: "MB/s", max: 600, redline: 520 },
  ],
  [
    { id: "load", label: "Load", value: 74, unit: "%", redline: 85 },
    { id: "core", label: "Core", value: 92, unit: "°", max: 120, redline: 100 },
    { id: "io", label: "I/O", value: 470, unit: "MB/s", max: 600, redline: 520 },
  ],
  [
    { id: "load", label: "Load", value: 91, unit: "%", redline: 85 },
    { id: "core", label: "Core", value: 108, unit: "°", max: 120, redline: 100 },
    { id: "io", label: "I/O", value: 545, unit: "MB/s", max: 600, redline: 520 },
  ],
];

export function GaugeClusterDemo() {
  const [index, setIndex] = React.useState(0);
  const reading = READINGS[index % READINGS.length] ?? READINGS[0]!;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GaugeCluster gauges={reading} />

      <button
        type="button"
        onClick={() => setIndex((value) => value + 1)}
        className="border-hairline bg-surface-1 hover:bg-surface-2 text-ink self-start rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
      >
        Next reading
      </button>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Reading{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {(index % READINGS.length) + 1} of {READINGS.length}
        </span>
      </p>
    </div>
  );
}
