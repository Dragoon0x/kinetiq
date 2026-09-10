"use client";

import * as React from "react";

import { SparklineGrid, type SparkMetric } from "@/registry/ui/sparkline-grid";

type Row = [name: string, unit: string, series: number[], note?: string];

/** Ids stay stable across windows, so an open tile stays open when the fleet's
 *  readings are replaced. Every series is seeded — nothing samples a clock. */
const build = (rows: Row[]): SparkMetric[] =>
  rows.map(([name, unit, series, note], index) => ({
    id: `m${index}`,
    name,
    unit,
    series,
    ...(note ? { anomaly: true, note } : {}),
  }));

const CALM = build([
  [
    "Requests",
    "req/s",
    [412, 418, 404, 421, 430, 425, 417, 409, 414, 422, 428, 419],
  ],
  ["P95 latency", "ms", [88, 92, 86, 90, 94, 89, 91, 87, 93, 90, 88, 92]],
  [
    "Error rate",
    "%",
    [0.3, 0.2, 0.4, 0.3, 0.2, 0.3, 0.5, 0.3, 0.2, 0.4, 0.3, 0.2],
  ],
  ["CPU", "%", [42, 45, 44, 47, 46, 43, 45, 48, 46, 44, 45, 47]],
  ["Queue depth", "jobs", [12, 9, 14, 11, 8, 13, 10, 12, 9, 11, 13, 10]],
  [
    "Resident memory",
    "MB",
    [610, 614, 612, 618, 616, 613, 617, 620, 615, 612, 618, 616],
  ],
]);

const INCIDENT = build([
  [
    "Requests",
    "req/s",
    [419, 425, 431, 428, 402, 381, 364, 352, 349, 358, 371, 386],
  ],
  [
    "P95 latency",
    "ms",
    [92, 95, 101, 118, 164, 232, 318, 404, 466, 412, 357, 301],
    "P95 crossed 400 ms while gate-relay retried its holds.",
  ],
  [
    "Error rate",
    "%",
    [0.2, 0.3, 0.4, 0.9, 1.8, 3.4, 5.1, 6.4, 5.8, 4.2, 2.6, 1.4],
  ],
  ["CPU", "%", [47, 49, 52, 58, 66, 74, 81, 86, 84, 78, 71, 64]],
  [
    "Queue depth",
    "jobs",
    [10, 13, 18, 27, 44, 71, 96, 124, 141, 132, 108, 84],
    "Queue depth held above 100 jobs for three samples.",
  ],
  [
    "Resident memory",
    "MB",
    [616, 619, 624, 631, 640, 652, 664, 671, 668, 659, 648, 637],
  ],
]);

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function SparklineGridDemo() {
  const [incident, setIncident] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const metrics = incident ? INCIDENT : CALM;
  const open = metrics.find((metric) => metric.id === openId);
  const flagged = metrics.filter((metric) => metric.anomaly).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SparklineGrid
        label="ledger-api fleet"
        metrics={metrics}
        expandedId={openId}
        onExpandedChange={setOpenId}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setIncident((was) => !was)}
        >
          {incident ? "Calm window" : "Next window"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={openId === null}
          onClick={() => setOpenId(null)}
        >
          Fold
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Window {incident ? 2 : 1} of 2 ·{" "}
        <span className="text-signal">{open ? open.name : "none open"}</span> ·{" "}
        {flagged} {flagged === 1 ? "anomaly" : "anomalies"}
      </p>
    </div>
  );
}
