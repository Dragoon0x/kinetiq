"use client";

import * as React from "react";

import { LoanSlider } from "@/registry/ui/loan-slider";

const APR = 9.9;
const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monthly = (principal: number, months: number) => {
  const r = APR / 1200;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
};

export function LoanSliderDemo() {
  const [amount, setAmount] = React.useState(12500);
  const [term, setTerm] = React.useState(36);

  const payment = monthly(amount, term);
  const interest = payment * term - amount;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <LoanSlider
        label="Loan amount"
        apr={APR}
        value={amount}
        onValueChange={setAmount}
        term={term}
        onTermChange={setTerm}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight Loans{" "}
        <span className="text-cobalt-bright tabular-nums">
          {MONEY.format(amount)} · {term} mo | {MONEY.format(payment)} / mo |
          interest {MONEY.format(interest)}
        </span>
      </p>
    </div>
  );
}
