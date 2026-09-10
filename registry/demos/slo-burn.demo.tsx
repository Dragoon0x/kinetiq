"use client";

import * as React from "react";

import { SloBurn, type BurnReading } from "@/registry/ui/slo-burn";

/** Coldbrook / gate-relay, one seeded 30-day window walked eight steps. */
const SCRIPT = [
  { elapsed: 0.08, remaining: 0.99 },
  { elapsed: 0.16, remaining: 0.96 },
  { elapsed: 0.22, remaining: 0.9 },
  { elapsed: 0.26, remaining: 0.62 },
  { elapsed: 0.29, remaining: 0.38 },
  { elapsed: 0.32, remaining: 0.21 },
  { elapsed: 0.4, remaining: 0.19 },
  { elapsed: 0.55, remaining: 0.17 },
] as const;

const LAST = SCRIPT.length - 1;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function SloBurnDemo() {
  const [step, setStep] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [projected, setProjected] = React.useState(false);
  const [burn, setBurn] = React.useState<BurnReading | null>(null);

  // A hidden tab throttles timers, so the window holds where it is rather than
  // jumping several steps the moment it comes back.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || hidden || step >= LAST) return;
    const timer = window.setTimeout(
      () => setStep((current) => Math.min(LAST, current + 1)),
      1200,
    );
    return () => window.clearTimeout(timer);
  }, [running, hidden, step]);

  const frame = SCRIPT[step] ?? SCRIPT[0];
  const atEnd = step >= LAST;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SloBurn
        label="gate-relay availability"
        remaining={frame.remaining}
        elapsed={frame.elapsed}
        projected={projected}
        onProjectedChange={setProjected}
        onBurnChange={setBurn}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            if (!running && atEnd) setStep(0);
            setRunning(!running);
          }}
        >
          {running ? "Pause window" : atEnd ? "Replay window" : "Run window"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={atEnd}
          onClick={() => setStep((current) => Math.min(LAST, current + 1))}
        >
          Step
        </button>
        <button
          type="button"
          className={chip}
          disabled={step === 0}
          onClick={() => {
            setRunning(false);
            setStep(0);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{burn ? `${burn.rate}× burn` : "—"}</span>
        {burn ? ` · ${burn.state} · ${burn.minutesLeft} min left` : ""}
        {projected && burn
          ? ` · ${burn.projectedMinutes} min at window end`
          : ""}
      </p>
    </div>
  );
}
