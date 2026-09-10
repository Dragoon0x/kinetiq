"use client";

import * as React from "react";

import { RateDial, type RateZone } from "@/registry/ui/rate-dial";

/** Waylight Pay / gate-relay, twenty seeded readings — the demo owns the clock. */
const SCRIPT = [
  120, 168, 204, 252, 318, 286, 340, 402, 466, 512, 548, 470, 412, 366, 300,
  254, 198, 160, 132, 108,
];

const HIGH = SCRIPT.indexOf(Math.max(...SCRIPT));

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function RateDialDemo() {
  const [step, setStep] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [peak, setPeak] = React.useState(0);
  const [zone, setZone] = React.useState<RateZone>("calm");

  // A hidden tab throttles timers, so the feed holds where it is rather than
  // fast-forwarding a burst of readings when it comes back.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || hidden) return;
    const timer = window.setInterval(
      () => setStep((current) => (current + 1) % SCRIPT.length),
      900,
    );
    return () => window.clearInterval(timer);
  }, [running, hidden]);

  const value = SCRIPT[step] ?? 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RateDial
        label="gate-relay"
        value={value}
        max={600}
        warnAt={450}
        onPeakChange={setPeak}
        onZoneChange={setZone}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => setRunning(!running)}
        >
          {running ? "Pause feed" : "Run feed"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={step === HIGH}
          onClick={() => setStep(HIGH)}
        >
          Spike
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{value} rps</span>
        {` · peak ${peak} rps · ${zone}`}
      </p>
    </div>
  );
}
