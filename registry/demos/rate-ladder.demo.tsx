"use client";

import * as React from "react";

import { RateLadder, type Rung } from "@/registry/ui/rate-ladder";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Coldbrook Bank's term deposits, three months to three years. */
const RUNGS: Rung[] = [
  { months: 3, rate: 3.6 },
  { months: 6, rate: 3.95 },
  { months: 12, rate: 4.3 },
  { months: 24, rate: 4.55 },
  { months: 36, rate: 4.7 },
];
const AMOUNT = 5000;
const START = "2026-09-08";

/** The same UTC arithmetic as the ladder, so the status line agrees with it. */
const maturityOf = (months: number) => {
  const [y = 2026, m = 1, d = 1] = START.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)));
};

export function RateLadderDemo() {
  const [months, setMonths] = React.useState(12);
  const rung = RUNGS.find((item) => item.months === months) ?? RUNGS[0]!;
  const interest = (AMOUNT * (rung.rate / 100) * rung.months) / 12;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RateLadder
        label="Term deposits"
        rungs={RUNGS}
        amount={AMOUNT}
        start={START}
        value={months}
        onValueChange={setMonths}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {rung.months} months · {rung.rate.toFixed(2)}% · Matures{" "}
        {day.format(maturityOf(rung.months))} · Earns {money.format(interest)}
      </p>
    </div>
  );
}
