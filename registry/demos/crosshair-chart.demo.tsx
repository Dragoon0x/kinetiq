"use client";

import * as React from "react";

import {
  CrosshairChart,
  type CrosshairPoint,
} from "@/registry/ui/crosshair-chart";

/**
 * Thirty days of Fernworks sessions. A seeded LCG at module scope keeps the
 * series byte-identical on the server and the client, so the chart hydrates
 * against the markup it was sent.
 */
const TRAFFIC: CrosshairPoint[] = (() => {
  let seed = 20260408;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  return Array.from({ length: 30 }, (_, day) => ({
    label: `Apr ${day + 1}`,
    value: Math.round(
      2400 + day * 58 + Math.sin(day / 2.1) * 340 + next() * 420,
    ),
  }));
})();

const sessions = (value: number) => Math.round(value).toLocaleString("en-US");

export function CrosshairChartDemo() {
  const [index, setIndex] = React.useState<number | null>(null);
  const point = index === null ? undefined : TRAFFIC[index];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <CrosshairChart
        points={TRAFFIC}
        label="Fernworks sessions"
        format={sessions}
        onActiveChange={setIndex}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {point ? (
          <>
            {point.label} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {sessions(point.value)}
            </span>{" "}
            sessions
          </>
        ) : (
          "Hover or arrow-key the trace"
        )}
      </p>
    </div>
  );
}
