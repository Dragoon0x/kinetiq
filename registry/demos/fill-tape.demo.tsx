"use client";

import * as React from "react";

import { FillTape, type Fill } from "@/registry/ui/fill-tape";

const STEP_MS = 750;
/** 14:22:07, minted by a counter rather than a clock, so renders are stable. */
const START_SECOND = 14 * 3600 + 22 * 60 + 7;
/** Enough tape to scroll; the demo caps its own data rather than virtualising. */
const KEEP = 40;

const pad = (value: number) => String(value).padStart(2, "0");
const clock = (second: number) =>
  `${pad(Math.floor(second / 3600) % 24)}:${pad(Math.floor(second / 60) % 60)}:${pad(second % 60)}`;

/** A small LCG: the same tape on the server, on the client, and every visit. */
const nextSeed = (seed: number) => (seed * 1103515245 + 12345) % 2147483648;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const OPENING = { seed: 71042, at: 0, fills: [] as Fill[] };

export function FillTapeDemo() {
  const [tape, setTape] = React.useState(OPENING);
  const [streaming, setStreaming] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [waiting, setWaiting] = React.useState(0);
  const [volume, setVolume] = React.useState(0);

  const printOne = React.useCallback(() => {
    setTape((current) => {
      const seed = nextSeed(current.seed);
      const fill: Fill = {
        id: `fill-${current.at}`,
        side: (seed >> 7) % 2 === 0 ? "buy" : "sell",
        price: (2418 + ((seed >> 11) % 15) - 7) / 100,
        size: 5 + ((seed >> 17) % 90),
        time: clock(START_SECOND + current.at * 3 + ((seed >> 5) % 3)),
      };
      return {
        seed,
        at: current.at + 1,
        fills: [...current.fills, fill].slice(-KEEP),
      };
    });
  }, []);

  React.useEffect(() => {
    if (!streaming) return;
    let timer = 0;
    const start = () => {
      if (!timer) timer = window.setInterval(printOne, STEP_MS);
    };
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };
    // A backgrounded tab must not bank a hundred fills to replay on return.
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [streaming, printOne]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <FillTape
        fills={tape.fills}
        symbol="BSN/USD"
        sizeUnit="BSN"
        onPausedChange={(held, count) => {
          setPaused(held);
          setWaiting(count);
        }}
        onVolumeSettle={setVolume}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={printOne}>
          Print fill
        </button>
        <button
          type="button"
          className={BUTTON}
          aria-pressed={streaming}
          onClick={() => setStreaming((running) => !running)}
        >
          {streaming ? "Stop" : "Stream"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={tape.at === 0}
          onClick={() => {
            setStreaming(false);
            setTape(OPENING);
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="tabular-nums">{tape.fills.length}</span> fills ·{" "}
        <span className="text-signal tabular-nums">{volume}</span> BSN ·{" "}
        {paused ? `Held · ${waiting} waiting` : "Running"}
      </p>
    </div>
  );
}
