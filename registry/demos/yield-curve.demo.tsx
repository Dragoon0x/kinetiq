"use client";

import * as React from "react";

import { YieldCurve, type YieldPoint } from "@/registry/ui/yield-curve";

const LADDER: YieldPoint[] = [
  { days: 30, apr: 3.1 },
  { days: 60, apr: 3.9 },
  { days: 90, apr: 4.6 },
  { days: 180, apr: 5.7 },
  { days: 270, apr: 6.4 },
  { days: 365, apr: 7.2 },
];

const DEPOSIT = 20000;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function YieldCurveDemo() {
  const [days, setDays] = React.useState(90);

  const point = LADDER.find((entry) => entry.days === days) ?? LADDER[2]!;
  const earns = (DEPOSIT * point.apr * point.days) / (100 * 365);
  const longest = days === LADDER[LADDER.length - 1]!.days;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <YieldCurve
        label="Coldbrook Bank · term ladder"
        points={LADDER}
        value={days}
        onValueChange={setDays}
        amount={DEPOSIT}
      />

      <button
        type="button"
        onClick={() =>
          setDays(longest ? LADDER[0]!.days : LADDER[LADDER.length - 1]!.days)
        }
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {longest ? "Shortest term" : "Longest term"}
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Term <span className="text-signal tabular-nums">{point.days} d</span> —
        Rate{" "}
        <span className="text-signal tabular-nums">
          {point.apr.toFixed(2)}%
        </span>{" "}
        — Earns{" "}
        <span className="text-signal tabular-nums">
          {currency.format(earns)}
        </span>
      </p>
    </div>
  );
}
