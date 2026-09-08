"use client";

import * as React from "react";

import { HoldingRow, type HoldingLot } from "@/registry/ui/holding-row";

/** A seeded walk built at module scope: server and client draw the same trace. */
function walk(seed: number, start: number) {
  let state = seed;
  let level = start;
  return Array.from({ length: 30 }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    level = level * (1 + (state / 2147483648 - 0.47) * 0.035);
    return Math.round(level * 100) / 100;
  });
}

const lots = (rows: [string, number, number][]): HoldingLot[] =>
  rows.map(([date, quantity, cost], index) => ({
    id: `${date}-${index}`,
    date,
    quantity,
    cost,
  }));

const POSITIONS = [
  {
    symbol: "BSN",
    name: "Basin Holdings",
    quantity: 2000,
    price: 24.18,
    changePercent: 1.24,
    history: walk(4471, 22.4),
    lots: lots([
      ["12 Mar 2025", 1200, 24960],
      ["4 Nov 2025", 800, 17840],
    ]),
  },
  {
    symbol: "FRN",
    name: "Fernwork Industrial",
    quantity: 940,
    price: 51.6,
    changePercent: -0.62,
    history: walk(8812, 53.2),
    lots: lots([
      ["22 Jan 2025", 540, 26460],
      ["9 Jun 2026", 400, 21280],
    ]),
  },
  {
    symbol: "CBK",
    name: "Coldbrook Utilities",
    quantity: 1350,
    price: 12.04,
    changePercent: 0.31,
    history: walk(1907, 11.6),
    lots: lots([["3 Aug 2025", 1350, 15390]]),
  },
];

type Feed = {
  prices: number[];
  changes: number[];
  seed: number;
  ticks: number;
};

/** One seeded step for every price, plus the change each step implies. */
function advance(current: Feed): Feed {
  let seed = current.seed;
  const prices = current.prices.map((price) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (
      Math.round(price * (1 + (seed / 2147483648 - 0.5) * 0.009) * 100) / 100
    );
  });
  const changes = prices.map((price, index) => {
    const previous = current.prices[index] ?? price;
    const step = previous === 0 ? 0 : ((price - previous) / previous) * 100;
    return (current.changes[index] ?? 0) + step;
  });
  return { prices, changes, seed, ticks: current.ticks + 1 };
}

export function HoldingRowDemo() {
  const [openSymbol, setOpenSymbol] = React.useState<string | null>("BSN");
  const [live, setLive] = React.useState(false);
  const [feed, setFeed] = React.useState<Feed>(() => ({
    prices: POSITIONS.map((position) => position.price),
    changes: POSITIONS.map((position) => position.changePercent),
    seed: 20260908,
    ticks: 0,
  }));

  React.useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      // A hidden tab must not tick: nobody is watching, and the walk would
      // sprint through minutes of prices the moment it came back.
      if (document.hidden) return;
      setFeed(advance);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [live]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {POSITIONS.map((position, index) => (
          <li key={position.symbol}>
            <HoldingRow
              {...position}
              price={feed.prices[index] ?? position.price}
              changePercent={feed.changes[index] ?? position.changePercent}
              open={openSymbol === position.symbol}
              onOpenChange={(next) =>
                setOpenSymbol(next ? position.symbol : null)
              }
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        role="switch"
        aria-checked={live}
        onClick={() => setLive((current) => !current)}
        className="inline-flex h-8 w-fit items-center justify-center gap-2 rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${live ? "bg-signal" : "bg-ink-3"}`}
        />
        Live prices
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {live ? "Live" : "Paused"} ·{" "}
        <span className="text-signal tabular-nums">
          {openSymbol ? `Open ${openSymbol}` : "All closed"}
        </span>{" "}
        · {feed.ticks} ticks
      </p>
    </div>
  );
}
