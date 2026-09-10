"use client";

import * as React from "react";

import { HeatWeek, type CellReading } from "@/registry/ui/heat-week";

/** Basinworks / dock-worker: the shape of a weekday, in requests per second. */
const HOUR_SHAPE = [
  62, 48, 41, 38, 44, 70, 118, 186, 244, 288, 312, 305, 276, 298, 330, 344, 318,
  286, 240, 198, 162, 130, 104, 78,
];

/** Monday through Sunday as a percentage of that shape. */
const DAY_FACTOR = [100, 106, 112, 104, 98, 56, 48];

/** Integer hash, unsigned before it is used: identical in Node and the browser,
 *  so the week renders the same on the server as it does after hydration. */
const jitter = (day: number, hour: number): number => {
  const mixed = Math.imul(day, 73856093) ^ Math.imul(hour, 19349663);
  const spread = Math.imul(mixed ^ (mixed >>> 13), 1274126177);
  return 92 + (((spread ^ (spread >>> 16)) >>> 0) % 17);
};

const VALUES: number[][] = DAY_FACTOR.map((factor, day) =>
  HOUR_SHAPE.map((shape, hour) =>
    Math.round((shape * factor * jitter(day, hour)) / 10000),
  ),
);

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PEAK = VALUES.reduce(
  (best, row, day) =>
    row.reduce(
      (inner, value, hour) =>
        value > inner.value ? { day, hour, value } : inner,
      best,
    ),
  { day: 0, hour: 0, value: 0 },
);

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function HeatWeekDemo() {
  const [day, setDay] = React.useState<number | null>(null);
  const [cell, setCell] = React.useState<CellReading | null>(null);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <HeatWeek
        label="dock-worker"
        values={VALUES}
        day={day}
        onDayChange={setDay}
        onCellChange={setCell}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => setDay(day === PEAK.day ? null : PEAK.day)}
        >
          {day === PEAK.day ? "Release" : "Busiest day"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={day === null}
          onClick={() => setDay(null)}
        >
          Show all
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {cell
            ? `${SHORT[cell.day] ?? ""} ${clock(cell.hour)}`
            : `peak ${SHORT[PEAK.day] ?? ""} ${clock(PEAK.hour)}`}
        </span>
        {cell ? ` · ${cell.value} rps` : ` · ${PEAK.value} rps`}
        {day === null ? " · all days" : ` · ${SHORT[day] ?? ""} only`}
      </p>
    </div>
  );
}
