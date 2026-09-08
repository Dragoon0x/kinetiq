"use client";

import * as React from "react";

import {
  dayLabel,
  periodDays,
  ProrationBar,
  prorate,
} from "@/registry/ui/proration-bar";

const START = "2026-09-01";
const END = "2026-10-01";
const PRICE = 48;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function ProrationBarDemo() {
  const days = periodDays(START, END);
  const [used, setUsed] = React.useState(11);
  const { used: usedAmount, credit } = prorate(PRICE, used, days);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <ProrationBar
        label="Studio plan · Fieldline"
        periodStart={START}
        periodEnd={END}
        price={PRICE}
        value={used}
        onValueChange={setUsed}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={used === 0}
          onClick={() => setUsed((current) => Math.max(0, current - 7))}
        >
          A week earlier
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={used === days}
          onClick={() => setUsed((current) => Math.min(days, current + 7))}
        >
          A week later
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Change <span className="text-signal">{dayLabel(START, used)}</span>
        {` · ${used} days used ${money.format(usedAmount)} · ${days - used} days credit ${money.format(credit)}`}
      </p>
    </div>
  );
}
