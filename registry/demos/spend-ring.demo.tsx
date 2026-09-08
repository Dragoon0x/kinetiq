"use client";

import * as React from "react";

import { SpendRing } from "@/registry/ui/spend-ring";

const BUDGET = 1400;
const DAYS = 30;
const CHARGE = 128;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const control =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function SpendRingDemo() {
  const [spent, setSpent] = React.useState(820);
  const [day, setDay] = React.useState(18);

  const over = spent - BUDGET;
  const ahead = over <= 0 && spent / BUDGET > day / DAYS;
  const state =
    over > 0
      ? `over by ${money.format(over)}`
      : ahead
        ? "ahead of pace"
        : "on pace";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SpendRing
        label="Coldbrook · October"
        spent={spent}
        budget={BUDGET}
        day={day}
        daysInMonth={DAYS}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSpent((value) => value + CHARGE)}
          className={control}
        >
          Add charge
        </button>
        <button
          type="button"
          disabled={day >= DAYS}
          onClick={() => setDay((value) => Math.min(DAYS, value + 1))}
          className={control}
        >
          Next day
        </button>
        <button
          type="button"
          onClick={() => {
            setSpent(820);
            setDay(18);
          }}
          className={control}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Day {day}/{DAYS} · {money.format(spent)} of {money.format(BUDGET)} ·{" "}
        {state}
      </p>
    </div>
  );
}
