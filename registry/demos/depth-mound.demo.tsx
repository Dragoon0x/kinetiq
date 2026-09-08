"use client";

import * as React from "react";

import { DepthMound, type DepthLevel } from "@/registry/ui/depth-mound";

const LEVELS = 10;
const TICK = 0.02;
const BEST_BID = 24.28;
const BEST_ASK = 24.32;

/** A tiny LCG: the book is seeded, so the server and the client agree. */
const next = (seed: number) => (seed * 1664525 + 1013904223) % 4294967296;

const book = (seed: number) => {
  let state = seed;
  const side = (best: number, direction: number): DepthLevel[] =>
    Array.from({ length: LEVELS }, (_, rank) => {
      state = next(state);
      const swell = 140 + rank * 90;
      return {
        price: Number((best + direction * rank * TICK).toFixed(2)),
        size: Math.round(swell + (state % 1000) * 0.6),
      };
    });
  return { bids: side(BEST_BID, -1), asks: side(BEST_ASK, 1) };
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function DepthMoundDemo() {
  const [seed, setSeed] = React.useState(20260908);
  const [running, setRunning] = React.useState(false);

  const churn = React.useCallback(() => setSeed((value) => next(value)), []);

  // Arrivals run only from the toggle, only while the tab is watched, and the
  // interval dies with the effect that made it.
  React.useEffect(() => {
    if (!running) return;
    let timer = 0;
    const start = () => {
      timer = window.setInterval(churn, 700);
    };
    const onVisibility = () => {
      window.clearInterval(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, churn]);

  const { bids, asks } = React.useMemo(() => book(seed), [seed]);
  const total = (levels: DepthLevel[]) =>
    levels.reduce((sum, level) => sum + level.size, 0);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <DepthMound symbol="FRN" bids={bids} asks={asks} height={168} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={churn}>
          Print
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setRunning((on) => !on)}
        >
          {running ? "Pause" : "Run"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        FRN · spread{" "}
        <span className="text-signal tabular-nums">
          {((asks[0]?.price ?? 0) - (bids[0]?.price ?? 0)).toFixed(2)}
        </span>{" "}
        · bid <span className="tabular-nums">{total(bids)}</span> / ask{" "}
        <span className="tabular-nums">{total(asks)}</span>
      </p>
    </div>
  );
}
