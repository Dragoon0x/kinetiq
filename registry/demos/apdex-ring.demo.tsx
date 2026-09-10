"use client";

import * as React from "react";

import { ApdexRing, type LatencySample } from "@/registry/ui/apdex-ring";

/** Two seeded hours of gate-relay settle latency, 8,240 requests each. The
 *  ring cuts them; nothing here is sampled from a clock. */
const FAST: LatencySample[] = [
  { ms: 40, count: 1200 },
  { ms: 80, count: 1800 },
  { ms: 120, count: 1500 },
  { ms: 180, count: 1100 },
  { ms: 240, count: 720 },
  { ms: 320, count: 560 },
  { ms: 480, count: 480 },
  { ms: 700, count: 320 },
  { ms: 1100, count: 260 },
  { ms: 1800, count: 180 },
  { ms: 3200, count: 120 },
];

const SLOW: LatencySample[] = [
  { ms: 40, count: 200 },
  { ms: 80, count: 500 },
  { ms: 120, count: 700 },
  { ms: 180, count: 900 },
  { ms: 240, count: 900 },
  { ms: 320, count: 850 },
  { ms: 480, count: 800 },
  { ms: 700, count: 1100 },
  { ms: 1100, count: 1000 },
  { ms: 1800, count: 720 },
  { ms: 3200, count: 570 },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ApdexRingDemo() {
  const [slow, setSlow] = React.useState(false);
  const [threshold, setThreshold] = React.useState(500);
  const [score, setScore] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ApdexRing
        label="gate-relay Apdex"
        samples={slow ? SLOW : FAST}
        thresholdMs={threshold}
        onThresholdChange={setThreshold}
        onScoreChange={setScore}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setSlow((was) => !was)}
        >
          {slow ? "Faster traffic" : "Slower traffic"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Traffic {slow ? "slow" : "fast"} · T {threshold} ms ·{" "}
        <span className="text-signal tabular-nums">{score.toFixed(3)}</span>
      </p>
    </div>
  );
}
