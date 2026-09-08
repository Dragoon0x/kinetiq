"use client";

import * as React from "react";

import {
  ForecastLine,
  projectBalance,
  type BalanceProjection,
  type ScheduledBill,
} from "@/registry/ui/forecast-line";

/** Waylight Pay, a current account on day 18 of 30 — fixed, invented figures. */
const HISTORY = [
  2480, 2455, 2402, 2388, 2331, 2296, 2260, 2244, 2189, 2150, 2118, 2072, 2041,
  1998, 1954, 1920, 1878, 1662,
];

const BILLS: ScheduledBill[] = [
  { id: "studio", label: "Fernworks Studio", day: 22, amount: 39 },
  { id: "utilities", label: "Coldbrook Utilities", day: 24, amount: 132 },
  { id: "rent", label: "Rent", day: 28, amount: 780 },
];

const DAYS = 30;
const BURN = 68;
const ALL = BILLS.map((bill) => bill.id);

/** Priced once at module scope, so the first status line is right without a
 *  render-time calculation the server and the browser could disagree about. */
const START = projectBalance(HISTORY, BILLS, new Set(ALL), DAYS, BURN);

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function ForecastLineDemo() {
  const [enabled, setEnabled] = React.useState<string[]>(ALL);
  const [plan, setPlan] = React.useState<BalanceProjection>(START);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <ForecastLine
        label="Waylight Pay · checking"
        history={HISTORY}
        bills={BILLS}
        enabled={enabled}
        onEnabledChange={setEnabled}
        onProjectionChange={setPlan}
        days={DAYS}
        dailyBurn={BURN}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {enabled.length} of {BILLS.length} bills on · closing{" "}
        {money.format(plan.closing)}
        {plan.shortDay === null ? "" : ` · short on day ${plan.shortDay}`}
      </p>
    </div>
  );
}
