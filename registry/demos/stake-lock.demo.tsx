"use client";

import * as React from "react";

import { StakeLock, type StakeTerm } from "@/registry/ui/stake-lock";

const TERMS: StakeTerm[] = [
  { days: 30, apr: 3.2 },
  { days: 90, apr: 4.8 },
  { days: 180, apr: 6.4 },
  { days: 365, apr: 8.1 },
];

const AMOUNT = 4200;

const amounts = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function StakeLockDemo() {
  const [days, setDays] = React.useState(90);
  const [locked, setLocked] = React.useState(false);

  const term = TERMS.find((entry) => entry.days === days) ?? TERMS[1]!;
  const projected = (AMOUNT * term.apr * term.days) / (100 * 365);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StakeLock
        label="Basinworks · stake"
        amount={AMOUNT}
        symbol="BSN"
        terms={TERMS}
        value={days}
        onValueChange={setDays}
        locked={locked}
        onLockedChange={setLocked}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Term{" "}
        <span className="text-signal tabular-nums">
          {term.days} d · {term.apr.toFixed(2)}%
        </span>{" "}
        — Yield{" "}
        <span className="text-signal tabular-nums">
          {amounts.format(projected)} BSN
        </span>{" "}
        — {locked ? "Locked" : "Open"}
      </p>
    </div>
  );
}
