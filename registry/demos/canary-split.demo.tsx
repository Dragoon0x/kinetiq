"use client";

import * as React from "react";

import {
  CanarySplit,
  type CanaryVerdict,
  type SplitReading,
} from "@/registry/ui/canary-split";

/** Coldbrook watches ledger-api 2.9.0 beside 2.8.4, ten seeded samples. */
const BASE = [0.12, 0.1, 0.11, 0.13, 0.1, 0.12, 0.11, 0.12, 0.1, 0.11];
const CLIMB = [0.13, 0.12, 0.15, 0.19, 0.26, 0.34, 0.42, 0.5, 0.57, 0.61];
const STEADY = [0.13, 0.12, 0.11, 0.14, 0.12, 0.1, 0.12, 0.11, 0.12, 0.1];
const FULL = BASE.length;

const NOTES: Partial<Record<CanaryVerdict, string>> = {
  failing: "Error rate is five times the baseline over the last two minutes.",
  ready: "Error rate has held with the baseline for ten minutes.",
  promoted: "The canary is now the baseline.",
  aborted: "Traffic went back to the baseline in one step.",
};

/** The reading a series is at now: its last sample. */
const last = (list: number[]): number => list[list.length - 1] ?? 0;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CanarySplitDemo() {
  const [climbing, setClimbing] = React.useState(true);
  const [seen, setSeen] = React.useState(3);
  const [playing, setPlaying] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [decided, setDecided] = React.useState<CanaryVerdict | null>(null);
  const [split, setSplit] = React.useState(20);
  const [reading, setReading] = React.useState<SplitReading | null>(null);

  // A hidden tab throttles timers, so the window holds where it is rather than
  // arriving at a verdict while nobody was watching.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const settled = seen >= FULL;

  React.useEffect(() => {
    if (!playing || hidden || settled) return;
    const timer = window.setTimeout(
      () => setSeen((count) => Math.min(FULL, count + 1)),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [playing, hidden, settled]);

  const points = (climbing ? CLIMB : STEADY).slice(0, seen);
  const basePoints = BASE.slice(0, seen);
  const verdict: CanaryVerdict =
    decided ?? (settled ? (climbing ? "failing" : "ready") : "watching");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CanarySplit
        label="ledger-api traffic"
        baseline={{
          label: "2.8.4 baseline",
          points: basePoints,
          rate: last(basePoints),
        }}
        canary={{
          label: "2.9.0 canary",
          points,
          rate: last(points),
        }}
        max={verdict === "promoted" ? 100 : 50}
        value={split}
        onValueChange={setSplit}
        verdict={verdict}
        note={NOTES[verdict]}
        onPromote={() => {
          setDecided("promoted");
          setSplit(100);
        }}
        onAbort={() => {
          setDecided("aborted");
          setSplit(0);
        }}
        onSplitChange={setReading}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={settled}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Hold window" : "Run window"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={seen > 3 || decided !== null}
          onClick={() => setClimbing(!climbing)}
        >
          {climbing ? "Steady canary" : "Climbing canary"}
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => {
            setPlaying(false);
            setSeen(3);
            setDecided(null);
            setSplit(20);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {reading ? `Canary ${reading.canary}%` : "—"}
        </span>
        {reading
          ? ` · baseline ${reading.baseline}% · ${last(points).toFixed(2)}% vs ${last(basePoints).toFixed(2)}% · ${reading.verdict}`
          : ""}
      </p>
    </div>
  );
}
