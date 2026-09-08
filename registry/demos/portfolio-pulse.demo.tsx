"use client";

import * as React from "react";

import { PortfolioPulse } from "@/registry/ui/portfolio-pulse";

const OPEN = 148000;
const STEP_MS = 850;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const walk = (seed: number) => {
  const next = (seed * 1103515245 + 12345) % 2147483648;
  return { seed: next, delta: ((next >> 11) % 181) - 88 };
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function PortfolioPulseDemo() {
  const [book, setBook] = React.useState({ seed: 20310418, value: OPEN });
  const [running, setRunning] = React.useState(false);
  const [ticks, setTicks] = React.useState(0);
  // A reset returns the value to its open, which the pulse rightly reports as
  // a tick; the demo's counter should not take that one.
  const resetting = React.useRef(false);
  const [moved, setMoved] = React.useState<"up" | "down" | "flat">("flat");

  const tick = React.useCallback(() => {
    setBook((current) => {
      const { seed, delta } = walk(current.seed);
      return { seed, value: Math.max(120000, current.value + delta) };
    });
  }, []);

  React.useEffect(() => {
    if (!running) return;
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
  }, [running, tick]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PortfolioPulse
        label="Basinworks · aggregate book"
        venue="Basinworks"
        value={book.value}
        open={OPEN}
        onTick={(_value, direction) => {
          if (resetting.current) {
            resetting.current = false;
            return;
          }
          setTicks((count) => count + 1);
          setMoved(direction);
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={tick}>
          Tick
        </button>
        <button
          type="button"
          className={BUTTON}
          aria-pressed={running}
          onClick={() => setRunning((live) => !live)}
        >
          {running ? "Stop" : "Live"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={ticks === 0}
          onClick={() => {
            setRunning(false);
            resetting.current = true;
            setBook({ seed: 20310418, value: OPEN });
            setTicks(0);
            setMoved("flat");
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Book{" "}
        <span className="text-signal tabular-nums">
          {money.format(book.value)}
        </span>{" "}
        · <span className="tabular-nums">{ticks}</span> ticks · {moved} · beat{" "}
        {running ? "live" : "held"}
      </p>
    </div>
  );
}
