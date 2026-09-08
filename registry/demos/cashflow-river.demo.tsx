"use client";

import * as React from "react";

import { CashflowRiver, type FlowStream } from "@/registry/ui/cashflow-river";

type Month = {
  id: string;
  label: string;
  inflows: FlowStream[];
  outflows: FlowStream[];
};

const INCOME = ["Retainers", "Projects", "Interest"];
const SPEND = ["Payroll", "Rent", "Supplies", "Tax"];

const streams = (names: string[], amounts: number[]): FlowStream[] =>
  names.map((label, index) => ({
    id: label.toLowerCase(),
    label,
    amount: amounts[index] ?? 0,
  }));

const month = (
  id: string,
  label: string,
  income: number[],
  spend: number[],
): Month => ({
  id,
  label,
  inflows: streams(INCOME, income),
  outflows: streams(SPEND, spend),
});

const NOVEMBER = month(
  "nov",
  "November",
  [11200, 7000, 200],
  [9200, 2200, 1560, 2300],
);

const MONTHS: Month[] = [
  month("sep", "September", [9800, 5200, 180], [8400, 2200, 1150, 2000]),
  month("oct", "October", [10400, 6900, 190], [8900, 2200, 1480, 2300]),
  NOVEMBER,
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const total = (list: FlowStream[]) =>
  list.reduce((all, stream) => all + stream.amount, 0);

const tab =
  "inline-flex h-8 items-center justify-center rounded-2 border px-3 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CashflowRiverDemo() {
  const [monthId, setMonthId] = React.useState(NOVEMBER.id);
  const [reading, setReading] = React.useState<FlowStream | null>(null);

  const current = MONTHS.find((entry) => entry.id === monthId) ?? NOVEMBER;
  const inSum = total(current.inflows);
  const outSum = total(current.outflows);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CashflowRiver
        label="Fieldline Ops · monthly cashflow"
        inflows={current.inflows}
        outflows={current.outflows}
        onReadChange={(stream) => setReading(stream)}
        format={(value) => money.format(value)}
      />

      <div className="flex items-center gap-1.5">
        {MONTHS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === monthId}
            onClick={() => setMonthId(entry.id)}
            className={
              entry.id === monthId
                ? `${tab} border-cobalt-bright bg-cobalt-wash text-foreground`
                : `${tab} border-input bg-surface-1 text-ink-2 hover:bg-accent`
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {current.label} · in{" "}
        <span className="tabular-nums">{money.format(inSum)}</span> · out{" "}
        <span className="tabular-nums">{money.format(outSum)}</span> · kept{" "}
        <span className="text-signal tabular-nums">
          {money.format(inSum - outSum)}
        </span>{" "}
        · reading{" "}
        {reading ? (
          <span className="tabular-nums">
            {reading.label} {money.format(reading.amount)}
          </span>
        ) : (
          <span>&mdash;</span>
        )}
      </p>
    </div>
  );
}
