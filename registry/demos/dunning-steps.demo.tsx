"use client";

import * as React from "react";

import { DunningSteps, type DunningStep } from "@/registry/ui/dunning-steps";

const STEPS: DunningStep[] = [
  { id: "friendly", title: "Friendly reminder", detail: "Email", day: 3 },
  { id: "second", title: "Second notice", detail: "Email", day: 7 },
  { id: "final", title: "Final notice", detail: "Email and letter", day: 14 },
  { id: "hold", title: "Service hold", detail: "Account", day: 21 },
];

/** Days compressed to seconds, so the rail can be watched end to end. */
const INTERVAL_MS = 3200;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function DunningStepsDemo() {
  const [running, setRunning] = React.useState(false);
  const [sent, setSent] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const done = sent >= STEPS.length;
  const next = STEPS[sent];

  const reset = () => {
    setRunning(false);
    setSent(0);
    setPaused(false);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <DunningSteps
        label="Invoice 2041 · reminders"
        steps={STEPS}
        running={running}
        sent={sent}
        onSentChange={setSent}
        paused={paused}
        onPausedChange={setPaused}
        intervalMs={INTERVAL_MS}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={running || done}
          onClick={() => setRunning(true)}
        >
          Run
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!running && sent === 0}
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {done ? "done" : !running ? "idle" : paused ? "paused" : "running"}
        </span>
        {` · ${sent} of ${STEPS.length} sent`}
        {running && !done && !paused && next ? ` · next ${next.title}` : ""}
      </p>
    </div>
  );
}
