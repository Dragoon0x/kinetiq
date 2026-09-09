"use client";

import * as React from "react";

import {
  AmortiseStack,
  type AmortiseSplit,
} from "@/registry/ui/amortise-stack";

const PRINCIPAL = 12000;
const RATE = 7.9;
const PERIODS = 36;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AmortiseStackDemo() {
  const [period, setPeriod] = React.useState(11);
  const [split, setSplit] = React.useState<AmortiseSplit | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <AmortiseStack
        label="Coldbrook Bank loan"
        principal={PRINCIPAL}
        rate={RATE}
        periods={PERIODS}
        value={period}
        onValueChange={(next, reading) => {
          setPeriod(next);
          setSplit(reading);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Period <span className="text-signal tabular-nums">{period + 1}</span> of{" "}
        {PERIODS}
        {split
          ? ` · interest ${money.format(split.interest)} · principal ${money.format(split.principal)}`
          : ` · ${money.format(PRINCIPAL)} at ${RATE}%`}
      </p>
    </div>
  );
}
