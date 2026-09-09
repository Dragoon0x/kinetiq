"use client";

import * as React from "react";

import { OverdraftLine, readOverdraft } from "@/registry/ui/overdraft-line";

/** Two weeks of end-of-day balances: a slide below zero, then pay lands. */
const DAYS = [
  412.2, 318.65, 240.1, 96.4, -52.3, -148.75, -166.05, -212.4, -286.9, -331.15,
  1188.6, 1044.35, 962.8, 910.15,
];
const LIMIT = 500;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function OverdraftLineDemo() {
  const [day, setDay] = React.useState(1);
  const reading = readOverdraft(DAYS, day);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <OverdraftLine
        label="Waylight Pay · Everyday"
        points={DAYS}
        limit={LIMIT}
        day={day}
        onDayChange={setDay}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={day >= DAYS.length}
          onClick={() => setDay(day + 1)}
        >
          Next day
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={day === 1}
          onClick={() => setDay(1)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Day <span className="text-signal tabular-nums">{day}</span> of{" "}
        {DAYS.length} · balance{" "}
        <span className="tabular-nums">{money.format(reading.balance)}</span> ·
        fee <span className="tabular-nums">{money.format(reading.fee)}</span>
      </p>
    </div>
  );
}
