"use client";

import * as React from "react";

import { RetryLadder, type RetryAttempt } from "@/registry/ui/retry-ladder";

/** Gaugeworks Reasoner at Waylight Pay, fetching rates three ways. */
const SCRIPT = [
  { id: "asked", label: "as asked", runs: 8, error: "timed out after 4s" },
  { id: "half", label: "half the date range", runs: 6, error: "rate limited" },
  { id: "cached", label: "from the cached snapshot", runs: 5 },
];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const ghost =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function RetryLadderDemo() {
  const [started, setStarted] = React.useState(0);
  const [ticks, setTicks] = React.useState(0);

  // A hidden tab pauses the script; an attempt should not resolve unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const current = started > 0 ? SCRIPT[started - 1] : undefined;
  const running = current !== undefined && ticks < current.runs;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const attempts: RetryAttempt[] = SCRIPT.slice(0, started).map(
    (entry, index) => {
      const settled = index < started - 1 || ticks >= entry.runs;
      return {
        id: entry.id,
        label: entry.label,
        status: !settled ? "running" : entry.error ? "failed" : "succeeded",
        error: entry.error,
      };
    },
  );
  const last = attempts[attempts.length - 1];

  const status = !last
    ? "Idle · press try"
    : last.status === "running"
      ? `Attempt ${started} running · ${last.label}`
      : last.status === "failed"
        ? `Attempt ${started} failed · ${last.error}`
        : `Succeeded on attempt ${started}`;

  const begin = (attempt: number) => {
    setStarted(attempt);
    setTicks(0);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RetryLadder
        label="fetch_rates"
        attempts={attempts}
        next={SCRIPT[started]?.label}
        maxAttempts={4}
        onRetry={() => begin(started + 1)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={started > 0}
          onClick={() => begin(1)}
          className={button}
        >
          Try
        </button>
        <button
          type="button"
          disabled={started === 0}
          onClick={() => begin(0)}
          className={ghost}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
