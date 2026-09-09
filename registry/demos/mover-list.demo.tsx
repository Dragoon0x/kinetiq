"use client";

import * as React from "react";

import { MoverList, type MoverView } from "@/registry/ui/mover-list";

/** Cents, so a long walk cannot drift the way floating money does. */
const BOARD = [
  { id: "bsn", symbol: "BSN", name: "Basin", open: 2418, close: 2361 },
  { id: "frn", symbol: "FRN", name: "Fernwork", open: 842, close: 851 },
  { id: "cbk", symbol: "CBK", name: "Coldbrook", open: 1290, close: 1275 },
  { id: "way", symbol: "WAY", name: "Waylight", open: 3106, close: 3120 },
  { id: "gge", symbol: "GGE", name: "Gauge", open: 566, close: 559 },
];
const SEED = 20240719;
const STEP_MS = 900;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const next = (seed: number) => (seed * 1103515245 + 12345) % 2147483648;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const opening = () => ({
  seed: SEED,
  cents: Object.fromEntries(BOARD.map((row) => [row.id, row.open])),
});

const percentOf = (asset: { price: number; previousClose: number }) =>
  ((asset.price - asset.previousClose) / asset.previousClose) * 100;

export function MoverListDemo() {
  const [tape, setTape] = React.useState(opening);
  const [view, setView] = React.useState<MoverView>("gainers");
  const [live, setLive] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);
  const [resorts, setResorts] = React.useState(0);

  const tick = React.useCallback(() => {
    setTape((current) => {
      // Two or three assets move per tick, so the order has a reason to change.
      let seed = next(current.seed);
      const cents = { ...current.cents };
      for (let index = 0; index < 2 + (seed % 2); index += 1) {
        seed = next(seed);
        const row = BOARD[(seed >> 8) % BOARD.length];
        seed = next(seed);
        if (!row) continue;
        const delta = (((seed >> 9) % 19) - 9) * (row.open > 2000 ? 3 : 1);
        cents[row.id] = Math.max(100, (cents[row.id] ?? row.open) + delta);
      }
      return { seed, cents };
    });
    setTicks((count) => count + 1);
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
    // A backgrounded tab must not bank a hundred ticks to replay on return.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, tick]);

  const reset = () => {
    setLive(false);
    setTape(opening());
    setTicks(0);
    setResorts(0);
  };

  const assets = BOARD.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    price: (tape.cents[row.id] ?? row.open) / 100,
    previousClose: row.close / 100,
  }));
  const sign = view === "gainers" ? 1 : -1;
  const leader = assets.reduce((best, asset) =>
    sign * (percentOf(asset) - percentOf(best)) > 0 ? asset : best,
  );
  const lead = percentOf(leader);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MoverList
        label="Basinworks movers"
        assets={assets}
        view={view}
        onViewChange={setView}
        onOrderChange={() => setResorts((count) => count + 1)}
      />

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
          disabled={ticks === 0}
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {view === "gainers" ? "Leading" : "Falling"}{" "}
        <span className="text-signal tabular-nums">
          {leader.symbol} {lead >= 0 ? "+" : "-"}
          {Math.abs(lead).toFixed(2)}%
        </span>{" "}
        · <span className="tabular-nums">{ticks}</span> ticks ·{" "}
        <span className="tabular-nums">{resorts}</span> resorts
      </p>
    </div>
  );
}
