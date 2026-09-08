"use client";

import * as React from "react";

import { PriceTicker, type PrintDirection } from "@/registry/ui/price-ticker";

/** Cents, so a long walk cannot drift the way floating money does. */
const OPEN = 2406;
const PREV_CLOSE = 2388;
const STEP_MS = 900;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const walk = (seed: number) => {
  const next = (seed * 1103515245 + 12345) % 2147483648;
  return { seed: next, delta: ((next >> 9) % 13) - 6 };
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function PriceTickerDemo() {
  const [tape, setTape] = React.useState({ seed: 20240612, cents: OPEN });
  const [live, setLive] = React.useState(false);
  const [prints, setPrints] = React.useState(0);
  const [direction, setDirection] = React.useState<PrintDirection>("flat");

  const print = React.useCallback(() => {
    setTape((current) => {
      const { seed, delta } = walk(current.seed);
      return { seed, cents: Math.max(1800, current.cents + delta) };
    });
  }, []);

  React.useEffect(() => {
    if (!live) return;
    let timer = 0;
    const start = () => {
      if (!timer) timer = window.setInterval(print, STEP_MS);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    // A backgrounded tab must not bank a thousand prints to replay on return.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, print]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PriceTicker
        price={tape.cents / 100}
        previousClose={PREV_CLOSE / 100}
        symbol="BSN/USD"
        venue="Basinworks"
        onPrint={(_price, moved) => {
          setPrints((count) => count + 1);
          setDirection(moved);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={print}>
          Print
        </button>
        <button
          type="button"
          className={BUTTON}
          aria-pressed={live}
          onClick={() => setLive((running) => !running)}
        >
          {live ? "Stop" : "Live"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={prints === 0}
          onClick={() => {
            setLive(false);
            setTape({ seed: 20240612, cents: OPEN });
            setPrints(0);
            setDirection("flat");
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Last{" "}
        <span className="text-signal tabular-nums">
          {money.format(tape.cents / 100)}
        </span>{" "}
        · <span className="tabular-nums">{prints}</span> prints · last{" "}
        {direction}
      </p>
    </div>
  );
}
