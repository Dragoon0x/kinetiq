"use client";

import * as React from "react";

import { PriceSparkline } from "@/registry/ui/price-sparkline";

/** Cents, so a long walk cannot drift the way floating money does. */
const OPEN = 2406;
const SEED = 20240720;
const STEP_MS = 800;
const INITIAL = 12;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const next = (seed: number) => (seed * 1103515245 + 12345) % 2147483648;

/** Ten-minute prints from the 09:30 open. */
const timeAt = (index: number) => {
  const minutes = 9 * 60 + 30 + index * 10;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

type Tape = { seed: number; cents: number[] };

const grow = (tape: Tape): Tape => {
  const seed = next(tape.seed);
  const last = tape.cents[tape.cents.length - 1] ?? OPEN;
  return {
    seed,
    cents: [...tape.cents, Math.max(1800, last + (((seed >> 9) % 15) - 7))],
  };
};

const opening = (): Tape => {
  let tape: Tape = { seed: SEED, cents: [OPEN] };
  for (let index = 1; index < INITIAL; index += 1) tape = grow(tape);
  return tape;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function PriceSparklineDemo() {
  const [tape, setTape] = React.useState(opening);
  const [live, setLive] = React.useState(false);
  const [reading, setReading] = React.useState<string | null>(null);

  const tick = React.useCallback(() => setTape(grow), []);

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
    // A backgrounded tab must not bank a day of prints to replay on return.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, tick]);

  const points = tape.cents.map((cents, index) => ({
    time: timeAt(index),
    price: cents / 100,
  }));
  const last = tape.cents[tape.cents.length - 1] ?? OPEN;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PriceSparkline
        label="BSN/USD"
        points={points}
        capacity={48}
        onReadChange={(point) => setReading(point?.time ?? null)}
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
          disabled={tape.cents.length === INITIAL}
          onClick={() => {
            setLive(false);
            setTape(opening());
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        BSN{" "}
        <span className="text-signal tabular-nums">
          {money.format(last / 100)}
        </span>{" "}
        · <span className="tabular-nums">{tape.cents.length}</span> points ·
        reading {reading ?? "last"}
      </p>
    </div>
  );
}
