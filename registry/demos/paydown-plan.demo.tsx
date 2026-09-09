"use client";

import * as React from "react";

import {
  PaydownPlan,
  type PaydownDebt,
  type PaydownProjection,
  type PaydownStrategy,
} from "@/registry/ui/paydown-plan";

const DEBTS: PaydownDebt[] = [
  {
    id: "card",
    name: "Fernworks card",
    balance: 2140,
    rate: 24.9,
    minimum: 65,
  },
  {
    id: "loan",
    name: "Coldbrook Bank loan",
    balance: 6400,
    rate: 6.4,
    minimum: 190,
  },
  {
    id: "line",
    name: "Waylight Pay line",
    balance: 860,
    rate: 18,
    minimum: 40,
  },
];

/** An explicit first month, so the plan reads the same on every visit. */
const START = { year: 2026, month: 10 };

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function PaydownPlanDemo() {
  const [strategy, setStrategy] = React.useState<PaydownStrategy>("rate");
  const [extra, setExtra] = React.useState(150);
  const [projection, setProjection] = React.useState<PaydownProjection | null>(
    null,
  );

  const payoff = projection
    ? `${MONTHS[projection.payoff.month - 1]} ${projection.payoff.year}`
    : "…";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <PaydownPlan
        label="Paydown plan"
        debts={DEBTS}
        start={START}
        strategy={strategy}
        onStrategyChange={setStrategy}
        extra={extra}
        onExtraChange={setExtra}
        onProjectionChange={setProjection}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {strategy === "rate" ? "Highest rate first" : "Smallest first"} · extra{" "}
        <span className="tabular-nums">{money.format(extra)}</span> · debt-free{" "}
        <span className="text-signal">{payoff}</span>
      </p>
    </div>
  );
}
