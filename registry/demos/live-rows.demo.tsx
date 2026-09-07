"use client";

import * as React from "react";

import { LiveRows, type LiveRow } from "@/registry/ui/live-rows";

const DESKS = ["WYL", "FLD", "FRN", "GGW", "BSN", "CBK"] as const;

/** Seeded from the sequence number, so a row is identical on server and client. */
function makeTrade(n: number): LiveRow {
  const desk = DESKS[n % DESKS.length];
  const buy = (n >> 1) % 2 === 0;
  const lots = 20 + ((n * 37) % 180);
  const price = 12 + ((n * 53) % 900) / 100;
  return {
    id: `trade-${n}`,
    content: (
      <div className="flex items-center justify-between gap-3 font-mono text-xs tabular-nums">
        <span className="flex min-w-0 items-center gap-2">
          <span className={buy ? "text-success" : "text-danger"}>
            {buy ? "BUY" : "SELL"}
          </span>
          <span className="truncate text-ink">{desk}</span>
        </span>
        <span className="shrink-0 text-ink-2">
          {lots} @ {price.toFixed(2)}
        </span>
      </div>
    ),
  };
}

export function LiveRowsDemo() {
  const [running, setRunning] = React.useState(false);
  const [trades, setTrades] = React.useState<LiveRow[]>([]);
  const [hovering, setHovering] = React.useState(false);
  const seq = React.useRef(0);

  React.useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      seq.current += 1;
      const trade = makeTrade(seq.current);
      // The buffer runs ahead of the list on purpose: held arrivals wait here.
      setTrades((prev) => [trade, ...prev].slice(0, 40));
    }, 900);
    return () => window.clearInterval(timer);
  }, [running]);

  const shown = Math.min(trades.length, 6);
  const state = !running ? "Stopped" : hovering ? "Held" : "Live";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning((was) => !was)}
          className="inline-flex h-8 items-center rounded-2 border border-input px-3 text-xs font-medium outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {running ? "Pause feed" : "Start feed"}
        </button>
        <button
          type="button"
          onClick={() => setTrades([])}
          disabled={trades.length === 0}
          className="inline-flex h-8 items-center rounded-2 border border-input px-3 text-xs font-medium outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <LiveRows
        items={trades}
        max={6}
        paused={!running}
        label="Coldbrook tape"
        emptyLabel="No trades yet. Start the feed."
        onHoldChange={setHovering}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Rows <span className="text-signal tabular-nums">{shown}</span> ·{" "}
        <span className="text-signal">{state}</span>
      </p>
    </div>
  );
}
