"use client";

import * as React from "react";

import {
  OrderBook,
  type BookLevel,
  type LevelReading,
} from "@/registry/ui/order-book";

/** Price and size, paired: a seeded book, so the server and the client draw
 *  the same ladder. */
const levels = (flat: number[]): BookLevel[] =>
  flat.flatMap((value, index) =>
    index % 2 === 0 ? [{ price: value, size: flat[index + 1] ?? 0 }] : [],
  );

const OPEN_BIDS = levels([
  24.16, 210, 24.13, 160, 24.11, 340, 24.07, 120, 24.02, 260, 23.98, 190,
]);

const OPEN_ASKS = levels([
  24.19, 180, 24.21, 240, 24.24, 120, 24.27, 320, 24.31, 210, 24.36, 160,
]);

const POSTS = [
  { side: "bid", price: 24.14, size: 140 },
  { side: "ask", price: 24.18, size: 90 },
  { side: "bid", price: 24.11, size: 220 },
  { side: "ask", price: 24.21, size: 180 },
  { side: "bid", price: 24.16, size: 160 },
  { side: "ask", price: 24.25, size: 130 },
] as const;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

/** Adds size at a price, opening a new level where the book has none. */
const post = (book: BookLevel[], price: number, size: number, dir: 1 | -1) =>
  (book.some((level) => level.price === price)
    ? book.map((level) =>
        level.price === price ? { ...level, size: level.size + size } : level,
      )
    : [...book, { price, size }]
  ).sort((a, b) => (a.price - b.price) * dir);

/** Takes size off the touch; an emptied level leaves the ladder. */
const fill = (book: BookLevel[], size: number) =>
  book
    .map((lvl, i) => (i === 0 ? { ...lvl, size: lvl.size - size } : lvl))
    .filter((level) => level.size > 0);

export function OrderBookDemo() {
  const [bids, setBids] = React.useState(OPEN_BIDS);
  const [asks, setAsks] = React.useState(OPEN_ASKS);
  const [posted, setPosted] = React.useState(0);
  const [moves, setMoves] = React.useState(0);
  const [reading, setReading] = React.useState<LevelReading | null>(null);

  const bestBid = bids[0]?.price ?? 0;
  const bestAsk = asks[0]?.price ?? 0;
  const postNext = () => {
    const order = POSTS[posted % POSTS.length];
    if (!order) return;
    if (order.side === "bid") {
      setBids((current) => post(current, order.price, order.size, -1));
    } else {
      setAsks((current) => post(current, order.price, order.size, 1));
    }
    setPosted((count) => count + 1);
    setMoves((count) => count + 1);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <OrderBook
        bids={bids}
        asks={asks}
        symbol="BSN/USD"
        sizeUnit="BSN"
        onLevelRead={setReading}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={postNext}>
          Post orders
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setBids((current) => fill(current, 150));
            setAsks((current) => fill(current, 150));
            setMoves((count) => count + 1);
          }}
        >
          Fill touch
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={moves === 0}
          onClick={() => {
            setBids(OPEN_BIDS);
            setAsks(OPEN_ASKS);
            setPosted(0);
            setMoves(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Spread{" "}
        <span className="text-signal tabular-nums">
          {Math.max(0, bestAsk - bestBid).toFixed(2)}
        </span>{" "}
        · Touch <span className="tabular-nums">{bestBid.toFixed(2)}</span> /{" "}
        <span className="tabular-nums">{bestAsk.toFixed(2)}</span> · Reading{" "}
        {reading
          ? `${reading.side} ${reading.price.toFixed(2)} · ${reading.cumulativeSize} BSN`
          : "—"}
      </p>
    </div>
  );
}
