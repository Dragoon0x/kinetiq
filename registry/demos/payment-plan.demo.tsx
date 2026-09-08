"use client";

import * as React from "react";

import { PaymentPlan } from "@/registry/ui/payment-plan";

const TOTAL = 1284;
const FEE_RATE = 0.02;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function PaymentPlanDemo() {
  const [count, setCount] = React.useState(3);

  // The same whole-cent split the instrument makes, so the status line and the
  // plan can never disagree about a cent.
  const charged = Math.round(TOTAL * 100 * (1 + FEE_RATE));
  const base = Math.floor(charged / count);
  const extra = charged - base * count;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PaymentPlan
        label="Order BSX-3390"
        total={TOTAL}
        value={count}
        onValueChange={setCount}
        min={2}
        max={8}
        feeRate={FEE_RATE}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {count} ×{" "}
        <span className="text-signal">{money.format(base / 100)}</span> ·
        charged {money.format(charged / 100)}
        {extra > 0 ? ` · first ${money.format((base + 1) / 100)}` : null}
      </p>
    </div>
  );
}
