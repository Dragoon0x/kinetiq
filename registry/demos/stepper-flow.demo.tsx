"use client";

import * as React from "react";

import { StepperFlow, type Step } from "@/registry/ui/stepper-flow";

const STEPS: Step[] = [
  { id: "account", label: "Account", description: "Credentials" },
  { id: "profile", label: "Profile", description: "About you" },
  { id: "review", label: "Review", description: "Confirm" },
  { id: "done", label: "Done", description: "Finished" },
];

export function StepperFlowDemo() {
  const [current, setCurrent] = React.useState(1);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <StepperFlow steps={STEPS} current={current} onStepChange={setCurrent} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setCurrent((value) => Math.max(0, value - 1))}
          disabled={current === 0}
          className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() =>
            setCurrent((value) => Math.min(STEPS.length - 1, value + 1))
          }
          disabled={current === STEPS.length - 1}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-2 px-3 py-1.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Step{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {current + 1}
        </span>{" "}
        of {STEPS.length}
      </p>
    </div>
  );
}
