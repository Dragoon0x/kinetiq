"use client";

import * as React from "react";

import { PositionCard } from "@/registry/ui/position-card";

const ENTRY = 23.86;
const TARGET = 26.4;
const SIZE = 40;
const START = Math.round(ENTRY * 100) + 22;

/** A seeded walk in cents, so the tape is identical on the server and client. */
const STEPS = [18, -6, 24, 11, -14, 32, 9, -5, 27, 16, -9, 21, 13, 34, -12, 19];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function PositionCardDemo() {
  const [tape, setTape] = React.useState({ cents: START, n: 0 });
  const [running, setRunning] = React.useState(false);
  const [realised, setRealised] = React.useState<number | null>(null);

  // Stable, so the interval below never has to be rebuilt to see a fresh step.
  const print = React.useCallback(() => {
    setTape((now) => ({
      cents: now.cents + (STEPS[now.n % STEPS.length] ?? 0),
      n: now.n + 1,
    }));
  }, []);

  // The tape runs only while the toggle is on and the tab is watched, and it is
  // torn down with the effect that made it.
  React.useEffect(() => {
    if (!running || realised !== null) return;
    let timer = 0;
    const start = () => {
      timer = window.setInterval(print, 900);
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
  }, [running, realised, print]);

  const price = tape.cents / 100;
  const pnl = (price - ENTRY) * SIZE;
  const signed = (value: number) =>
    `${value >= 0 ? "+" : "-"}${money.format(Math.abs(value))}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PositionCard
        symbol="BSN"
        side="long"
        size={SIZE}
        entry={ENTRY}
        price={price}
        target={TARGET}
        closed={realised !== null}
        onClose={(value) => {
          setRunning(false);
          setRealised(value);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={print}
          disabled={realised !== null}
        >
          Print
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setRunning((on) => !on)}
          disabled={realised !== null}
        >
          {running ? "Pause" : "Run"}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setRunning(false);
            setRealised(null);
            setTape({ cents: START, n: 0 });
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {realised === null ? "BSN long · mark " : "BSN closed · realised "}
        <span className="text-signal tabular-nums">
          {realised === null ? price.toFixed(2) : signed(realised)}
        </span>
        {realised === null ? ` · P&L ${signed(pnl)}` : null}
      </p>
    </div>
  );
}
