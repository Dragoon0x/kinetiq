"use client";

import * as React from "react";

import { MarketClock, type MarketSession } from "@/registry/ui/market-clock";

/** 09:00–12:30 and 13:30–16:30 at an invented venue. */
const SESSIONS: MarketSession[] = [
  { label: "Morning", from: 540, to: 750 },
  { label: "Afternoon", from: 810, to: 990 },
];

/** A fixed start, so the first paint is the same on the server and client. */
const START = 12 * 60 + 14;
const STEP = 3;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const face = (minute: number) => {
  const at = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(
    Math.floor(at % 60),
  ).padStart(2, "0")}`;
};

export function MarketClockDemo() {
  const [minute, setMinute] = React.useState(START);
  const [running, setRunning] = React.useState(false);
  const [open, setOpen] = React.useState(true);

  // Fast-forward runs only from the toggle, only while the tab is watched, and
  // the interval dies with the effect that made it.
  React.useEffect(() => {
    if (!running) return;
    let timer = 0;
    const tick = () => setMinute((at) => at + STEP);
    const start = () => {
      timer = window.setInterval(tick, 250);
    };
    const onVisibility = () => {
      window.clearInterval(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MarketClock
        minute={minute}
        sessions={SESSIONS}
        label="Basinworks Exchange"
        zone="Venue time"
        onStateChange={setOpen}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setRunning((on) => !on)}
        >
          {running ? "Pause" : "Run"}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setRunning(false);
            setMinute(START);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Basinworks · <span className="tabular-nums">{face(minute)}</span> ·{" "}
        <span className={open ? "text-signal" : ""}>
          {open ? "open" : "closed"}
        </span>
      </p>
    </div>
  );
}
