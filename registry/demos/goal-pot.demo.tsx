"use client";

import * as React from "react";

import { GoalPot } from "@/registry/ui/goal-pot";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Fieldline's "Camera body" pot — a little over half way. */
const START = 640;
const GOAL = 1200;

export function GoalPotDemo() {
  const [saved, setSaved] = React.useState(START);
  const [lastAdded, setLastAdded] = React.useState<number | null>(null);

  const reached = saved >= GOAL;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GoalPot
        label="Camera body"
        value={saved}
        goal={GOAL}
        onValueChange={(next, added) => {
          setSaved(next);
          setLastAdded(added);
        }}
      />

      <button
        type="button"
        onClick={() => {
          setSaved(START);
          setLastAdded(null);
        }}
        className="h-8 w-fit rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reset pot
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reached
          ? `Goal reached · ${money.format(saved)} saved`
          : lastAdded !== null
            ? `Added ${money.format(lastAdded)} · ${money.format(saved)} of ${money.format(GOAL)}`
            : `Saved ${money.format(saved)} of ${money.format(GOAL)} · ${money.format(GOAL - saved)} to go`}
      </p>
    </div>
  );
}
