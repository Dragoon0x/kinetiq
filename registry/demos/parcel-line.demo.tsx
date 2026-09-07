"use client";

import * as React from "react";

import { ParcelLine, type ParcelStop } from "@/registry/ui/parcel-line";

const STOPS: ParcelStop[] = [
  { id: "collected", label: "Collected", time: "08:10" },
  { id: "depot", label: "Basinworks depot", time: "11:35" },
  { id: "transit", label: "In transit", time: "14:02" },
  { id: "hub", label: "Local hub", time: "16:48" },
  { id: "doorstep", label: "Doorstep", time: "18:40" },
];

/** The estimate tightens as the parcel gets closer. */
const ETAS = ["ETA 19:20", "ETA 19:05", "ETA 18:55", "ETA 18:45", "Arrived"];

export function ParcelLineDemo() {
  const [current, setCurrent] = React.useState(1);
  const last = STOPS.length - 1;
  const stop = STOPS[current];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ParcelLine
        stops={STOPS}
        current={current}
        eta={ETAS[current] ?? ETAS[last] ?? ""}
        label="Basinworks · BW-4412"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCurrent((n) => (n >= last ? 0 : n + 1))}
          className="inline-flex h-9 cursor-pointer items-center rounded-2 bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {current >= last ? "Send another" : "Advance"}
        </button>
        <button
          type="button"
          onClick={() => setCurrent(0)}
          disabled={current === 0}
          className="inline-flex h-9 cursor-pointer items-center rounded-2 border border-hairline-strong px-3 text-sm font-medium text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50"
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Stop {current + 1} of {STOPS.length} ·{" "}
        <span className="text-signal">{stop?.label ?? "Unknown"}</span>
      </p>
    </div>
  );
}
