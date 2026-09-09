"use client";

import * as React from "react";

import { WatchlistRow } from "@/registry/ui/watchlist-row";

/** Cents, so a long walk cannot drift the way floating money does. */
const ROWS = [
  { id: "bsn", symbol: "BSN", name: "Basin", open: 2418, close: 2361 },
  { id: "frn", symbol: "FRN", name: "Fernwork", open: 842, close: 851 },
  { id: "cbk", symbol: "CBK", name: "Coldbrook", open: 1290, close: 1275 },
];
const SEED = 20240721;
const STEP_MS = 900;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const next = (seed: number) => (seed * 1103515245 + 12345) % 2147483648;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const opening = () => ({
  seed: SEED,
  cents: Object.fromEntries(ROWS.map((row) => [row.id, row.open])),
  last: null as { symbol: string; cents: number } | null,
});

export function WatchlistRowDemo() {
  const [tape, setTape] = React.useState(opening);
  const [unwatched, setUnwatched] = React.useState<string[]>([]);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [live, setLive] = React.useState(false);

  const tick = React.useCallback(() => {
    setTape((current) => {
      // One print per tick, so the roll is seen on one row at a time.
      const seed = next(current.seed);
      const row = ROWS[(seed >> 8) % ROWS.length];
      if (!row) return current;
      const delta = (((seed >> 9) % 19) - 9) * (row.open > 2000 ? 3 : 1);
      const cents = Math.max(100, (current.cents[row.id] ?? row.open) + delta);
      return {
        seed,
        cents: { ...current.cents, [row.id]: cents },
        last: { symbol: row.symbol, cents },
      };
    });
  }, []);

  React.useEffect(() => {
    if (!live) return;
    let timer = 0;
    const start = () => {
      if (!timer) timer = window.setInterval(tick, STEP_MS);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    // A backgrounded tab must not bank a hundred prints to replay on return.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, tick]);

  const shown = ROWS.filter((row) => !removed.includes(row.id));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ul
        aria-label="Basinworks watchlist"
        className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-surface-1 px-3"
      >
        {shown.map((row) => (
          <WatchlistRow
            key={row.id}
            id={row.id}
            symbol={row.symbol}
            name={row.name}
            price={(tape.cents[row.id] ?? row.open) / 100}
            previousClose={row.close / 100}
            watched={!unwatched.includes(row.id)}
            onWatchedChange={(watched) =>
              setUnwatched((ids) =>
                watched ? ids.filter((id) => id !== row.id) : [...ids, row.id],
              )
            }
            onRemoved={(id) => setRemoved((ids) => [...ids, id])}
          />
        ))}
        {shown.length === 0 ? (
          <li className="py-3 text-xs text-ink-3">Nothing watched.</li>
        ) : null}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={tick}>
          Tick
        </button>
        <button
          type="button"
          className={BUTTON}
          aria-pressed={live}
          onClick={() => setLive((on) => !on)}
        >
          {live ? "Stop" : "Live"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={
            tape.last === null && unwatched.length === 0 && removed.length === 0
          }
          onClick={() => {
            // Stars come back with the prices, so a row caught mid-leave
            // returns instead of finishing its exit after the reset.
            setLive(false);
            setTape(opening());
            setUnwatched([]);
            setRemoved([]);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="tabular-nums">{shown.length}</span> watched · last tick{" "}
        <span className="text-signal tabular-nums">
          {tape.last
            ? `${tape.last.symbol} ${money.format(tape.last.cents / 100)}`
            : "none"}
        </span>{" "}
        ·{" "}
        {removed.length > 0
          ? `removed ${removed.map((id) => id.toUpperCase()).join(" ")}`
          : "none removed"}
      </p>
    </div>
  );
}
