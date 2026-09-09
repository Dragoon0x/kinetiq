"use client";

import * as React from "react";

import { GoalCard } from "@/registry/ui/goal-card";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Coldbrook Bank's winter tyres: 360 of 600, thirty a week. */
const GOAL = 600;
const START = 360;
const STEP = 30;

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function GoalCardDemo() {
  const [saved, setSaved] = React.useState(START);
  const [open, setOpen] = React.useState(false);
  const [added, setAdded] = React.useState<number | null>(null);

  const percent = Math.round((Math.min(saved, GOAL) / GOAL) * 100);
  const reached = saved >= GOAL;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GoalCard
        label="Winter tyres"
        goal={GOAL}
        step={STEP}
        weekly={STEP}
        deadline="By 30 Nov"
        value={saved}
        onValueChange={(value, amount) => {
          setSaved(value);
          setAdded(amount);
        }}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setSaved(START);
            setOpen(false);
            setAdded(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reached
          ? `Goal reached · ${money.format(saved)} saved`
          : added !== null
            ? `Added ${money.format(added)} · ${percent}% · Details ${open ? "open" : "closed"}`
            : `Saved ${money.format(saved)} of ${money.format(GOAL)} · ${percent}% · Details ${open ? "open" : "closed"}`}
      </p>
    </div>
  );
}
