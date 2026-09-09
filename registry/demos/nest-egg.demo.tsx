"use client";

import * as React from "react";

import { NestEgg } from "@/registry/ui/nest-egg";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Fernworks Retire: 2,500 in, 200 a month, thirty years. */
const PRINCIPAL = 2500;
const MONTHLY = 200;
const YEARS = 30;
const RATES = [3, 5, 7, 9];

/** The same monthly compounding as the chart, so the status line agrees with it. */
const balanceAt = (rate: number, k: number) => {
  const i = rate / 100 / 12;
  const n = 12 * k;
  if (i === 0) return PRINCIPAL + MONTHLY * n;
  const growth = Math.pow(1 + i, n);
  return PRINCIPAL * growth + (MONTHLY * (growth - 1)) / i;
};

export function NestEggDemo() {
  const [rate, setRate] = React.useState(5);
  const [year, setYear] = React.useState(20);

  const balance = balanceAt(rate, year);
  const growth = Math.max(0, balance - (PRINCIPAL + MONTHLY * 12 * year));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <NestEgg
        label="Nest egg"
        principal={PRINCIPAL}
        monthly={MONTHLY}
        years={YEARS}
        rates={RATES}
        rate={rate}
        onRateChange={setRate}
        year={year}
        onYearChange={setYear}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Year {year} · {rate}% · {money.format(balance)} · Growth{" "}
        {money.format(growth)}
      </p>
    </div>
  );
}
