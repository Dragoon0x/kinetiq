"use client";

import * as React from "react";

import { GasTracker } from "@/registry/ui/gas-tracker";

const SAMPLE_MS = 1200;
const WINDOW = 28;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

/** One height for every control in the row, so the buttons line up. */
const Btn = (props: React.ComponentProps<"button">) => (
  <button type="button" {...props} className={BUTTON} />
);

/** Integer noise in 0–1. No trigonometry, so no last-digit disagreement. */
const noise = (i: number): number =>
  (((i * 1103515245 + 12345) >>> 16) % 1000) / 1000;

/**
 * A seeded walk: reading n depends only on n, so the server and the client
 * agree and the same run replays on every reload. Three offset samples are
 * blended so the line wanders instead of jumping.
 */
function reading(n: number): number {
  const blend = noise(n) * 0.5 + noise(n - 1) * 0.3 + noise(n - 2) * 0.2;
  return Number((12 + blend * 26).toFixed(1));
}

const SEED = Array.from({ length: 14 }, (_, index) => reading(index));

export function GasTrackerDemo() {
  const [samples, setSamples] = React.useState<number[]>(SEED);
  const [ceiling, setCeiling] = React.useState(30);
  const [running, setRunning] = React.useState(false);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [visible, setVisible] = React.useState(true);
  const seq = React.useRef(SEED.length);

  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => {
      const next = reading(seq.current);
      seq.current += 1;
      setSamples((current) => [...current, next].slice(-WINDOW));
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const current = samples[samples.length - 1] ?? 0;
  const place =
    cursor === null ? "live" : `reading ${cursor + 1} of ${samples.length}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GasTracker
        value={current}
        history={samples.slice(0, -1)}
        threshold={ceiling}
        capacity={WINDOW}
        label="Basin relay fee"
        onSelectedIndexChange={setCursor}
      />

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setRunning((was) => !was)}>
          {running ? "Pause sampling" : "Start sampling"}
        </Btn>
        <Btn
          disabled={ceiling <= 10}
          onClick={() => setCeiling((value) => Math.max(10, value - 5))}
        >
          Ceiling −5
        </Btn>
        <Btn
          disabled={ceiling >= 50}
          onClick={() => setCeiling((value) => Math.min(50, value + 5))}
        >
          Ceiling +5
        </Btn>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Fee{" "}
        <span className="text-signal tabular-nums">{current.toFixed(1)}</span>{" "}
        gu · ceiling <span className="tabular-nums">{ceiling}</span> ·{" "}
        <span className="text-signal">
          {current >= ceiling ? "over" : "under"}
        </span>{" "}
        · {place}
      </p>
    </div>
  );
}
