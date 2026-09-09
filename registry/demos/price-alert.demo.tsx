"use client";

import * as React from "react";

import { PriceAlert } from "@/registry/ui/price-alert";

/** Cents, so a long walk cannot drift the way floating money does. */
const OPEN = 2406;
const SEED = 20240722;
const STEP_MS = 800;
const INITIAL = 40;
/** Prints kept on the chart; older ones scroll off the left. */
const KEEP = 60;
const THRESHOLD = 24.4;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const next = (seed: number) => (seed * 1103515245 + 12345) % 2147483648;

type Tape = { seed: number; cents: number[] };

const grow = (tape: Tape): Tape => {
  const seed = next(tape.seed);
  const last = tape.cents[tape.cents.length - 1] ?? OPEN;
  const cents = [
    ...tape.cents,
    Math.max(1800, last + (((seed >> 9) % 17) - 8)),
  ];
  return { seed, cents: cents.slice(-KEEP) };
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

export function PriceAlertDemo() {
  const [tape, setTape] = React.useState(opening);
  const [threshold, setThreshold] = React.useState(THRESHOLD);
  const [live, setLive] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);
  const [crossings, setCrossings] = React.useState(0);

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
    // A backgrounded tab must not bank a day of prints to replay on return.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live, tick]);

  const points = tape.cents.map((cents) => cents / 100);
  const last = points[points.length - 1] ?? OPEN / 100;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PriceAlert
        label="BSN/USD alert"
        points={points}
        min={22.8}
        max={25.6}
        value={threshold}
        onValueChange={setThreshold}
        onCross={() => setCrossings((count) => count + 1)}
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
          disabled={ticks === 0 && threshold === THRESHOLD}
          onClick={() => {
            setLive(false);
            setTape(opening());
            setThreshold(THRESHOLD);
            setTicks(0);
            setCrossings(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Alert{" "}
        <span className="text-signal tabular-nums">
          {money.format(threshold)}
        </span>{" "}
        · BSN <span className="tabular-nums">{money.format(last)}</span> ·{" "}
        {last >= threshold ? "waiting below" : "waiting above"} ·{" "}
        <span className="tabular-nums">{crossings}</span> crossings
      </p>
    </div>
  );
}
