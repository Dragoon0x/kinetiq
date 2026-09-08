"use client";

import * as React from "react";

import { WatchDrag, type WatchHolding } from "@/registry/ui/watch-drag";

const HOLDINGS: WatchHolding[] = [
  { id: "bsn", symbol: "BSN", name: "Basin", price: 43.6, percent: 2.4 },
  { id: "frn", symbol: "FRN", name: "Fernwork", price: 18.05, percent: -1.2 },
  { id: "cbk", symbol: "CBK", name: "Coldbrook", price: 126.4, percent: 0.8 },
  { id: "gge", symbol: "GGE", name: "Gauge", price: 9.72, percent: -4.6 },
  { id: "way", symbol: "WAY", name: "Waylight", price: 61.15, percent: 1.1 },
  { id: "fld", symbol: "FLD", name: "Fieldline", price: 27.3, percent: 0 },
];

const SEED = HOLDINGS.map((holding) => holding.id);

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function WatchDragDemo() {
  const [order, setOrder] = React.useState(SEED);
  const [moves, setMoves] = React.useState(0);

  const untouched = order.every((id, index) => id === SEED[index]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <WatchDrag
        label="Coldbrook Bank · watchlist"
        holdings={HOLDINGS}
        order={order}
        onOrderChange={(next) => {
          setOrder(next);
          setMoves((count) => count + 1);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={untouched}
          onClick={() => {
            setOrder(SEED);
            setMoves(0);
          }}
        >
          Reset order
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Order{" "}
        <span className="text-signal">
          {order
            .map((id) => HOLDINGS.find((row) => row.id === id)?.symbol ?? id)
            .join(" · ")}
        </span>{" "}
        — moves <span className="tabular-nums">{moves}</span>
      </p>
    </div>
  );
}
