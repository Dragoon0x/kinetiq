"use client";

import * as React from "react";

import { StageProgress, type Stage } from "@/registry/ui/stage-progress";

const STAGES: Stage[] = [
  { id: "intake", label: "Intake" },
  { id: "press", label: "Press" },
  { id: "cure", label: "Cure" },
  { id: "seal", label: "Seal" },
];

/** Quarters of a stage, so one press moves a visible amount. */
const PER_STAGE = 4;
const TOTAL = STAGES.length * PER_STAGE;

export function StageProgressDemo() {
  const [step, setStep] = React.useState(5);

  const current = Math.floor(step / PER_STAGE);
  const within = (step % PER_STAGE) / PER_STAGE;
  const finished = step >= TOTAL;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <StageProgress
        stages={STAGES}
        current={current}
        progress={within}
        aria-label="Cell run"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setStep((value) => Math.min(TOTAL, value + 1))}
          disabled={finished}
          className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        >
          Advance
        </button>
        <button
          type="button"
          onClick={() => setStep(0)}
          className="border-input hover:bg-accent rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Run{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {finished
            ? "complete"
            : `${STAGES[current]?.label ?? ""} ${Math.round(within * 100)}%`}
        </span>
      </p>
    </div>
  );
}
