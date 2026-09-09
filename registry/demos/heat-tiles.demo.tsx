"use client";

import * as React from "react";

import { HeatTiles } from "@/registry/ui/heat-tiles";

/** Cents, so a long walk cannot drift the way floating money does. */
const BOARD = [
  { id: "bsn", symbol: "BSN", name: "Basin", open: 2418, close: 2361 },
  { id: "frn", symbol: "FRN", name: "Fernwork", open: 842, close: 851 },
  { id: "cbk", symbol: "CBK", name: "Coldbrook", open: 1290, close: 1275 },
  { id: "way", symbol: "WAY", name: "Waylight", open: 3106, close: 3120 },
  { id: "gge", symbol: "GGE", name: "Gauge", open: 566, close: 559 },
  { id: "tdw", symbol: "TDW", name: "Tidewater", open: 1744, close: 1790 },
  { id: "kln", symbol: "KLN", name: "Kilnstone", open: 412, close: 409 },
  { id: "msb", symbol: "MSB", name: "Mossbank", open: 980, close: 1002 },
];
const SEED = 20240723;
const STEP_MS = 900;
const HISTORY = 24;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const next = (seed: number) => (seed * 1103515245 + 12345) % 2147483648;

type Tape = { seed: number; cents: Record<string, number[]> };

/** Every asset prints once per tick, so the whole board warms or cools together. */
const grow = (tape: Tape): Tape => {
  let seed = tape.seed;
  const cents: Record<string, number[]> = {};
  for (const row of BOARD) {
    seed = next(seed);
    const history = tape.cents[row.id] ?? [row.open];
    const last = history[history.length - 1] ?? row.open;
    const delta = (((seed >> 9) % 19) - 9) * (row.open > 2000 ? 3 : 1);
    cents[row.id] = [...history, Math.max(100, last + delta)].slice(-HISTORY);
  }
  return { seed, cents };
};

const opening = (): Tape => {
  let tape: Tape = { seed: SEED, cents: {} };
  for (let index = 0; index < 10; index += 1) tape = grow(tape);
  return tape;
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function HeatTilesDemo() {
  const [tape, setTape] = React.useState(opening);
  const [open, setOpen] = React.useState<string | null>(null);
  const [live, setLive] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);

  const tick = React.useCallback(() => {
    setTape(grow);
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

  const assets = BOARD.map((row) => {
    const history = tape.cents[row.id] ?? [row.open];
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      price: (history[history.length - 1] ?? row.open) / 100,
      previousClose: row.close / 100,
      history: history.map((cents) => cents / 100),
    };
  });
  const warmest = assets.reduce((best, asset) =>
    asset.price / asset.previousClose > best.price / best.previousClose
      ? asset
      : best,
  );
  const lead =
    ((warmest.price - warmest.previousClose) / warmest.previousClose) * 100;
  const opened = assets.find((asset) => asset.id === open);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HeatTiles
        label="Basinworks board"
        assets={assets}
        expanded={open}
        onExpandedChange={setOpen}
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
          onClick={() => {
            setLive(false);
            setTape(opening());
            setTicks(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="tabular-nums">{assets.length}</span> tiles ·{" "}
        <span className="tabular-nums">{ticks}</span> ticks · warmest{" "}
        <span className="text-signal tabular-nums">
          {warmest.symbol} {lead >= 0 ? "+" : "-"}
          {Math.abs(lead).toFixed(2)}%
        </span>{" "}
        · {opened ? `open ${opened.symbol}` : "none open"}
      </p>
    </div>
  );
}
