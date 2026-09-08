"use client";

import * as React from "react";

import { StatementFold } from "@/registry/ui/statement-fold";

const MONTHS = [
  { month: "June", year: 2026, income: 5120, spend: 4336.8 },
  { month: "July", year: 2026, income: 5120, spend: 5402.1 },
  { month: "August", year: 2026, income: 6480, spend: 5195.8 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function StatementFoldDemo() {
  const [at, setAt] = React.useState(MONTHS.length - 1);
  const [open, setOpen] = React.useState(true);

  const statement = MONTHS[at] ?? MONTHS[0];
  const net = (statement?.income ?? 0) - (statement?.spend ?? 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StatementFold
        month={statement?.month ?? ""}
        year={statement?.year}
        accountName="Waylight Pay · Everyday"
        income={statement?.income ?? 0}
        spend={statement?.spend ?? 0}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={at === 0}
          onClick={() => setAt((index) => Math.max(0, index - 1))}
        >
          Previous month
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={at === MONTHS.length - 1}
          onClick={() =>
            setAt((index) => Math.min(MONTHS.length - 1, index + 1))
          }
        >
          Next month
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{statement?.month}</span> ·{" "}
        {open ? "open" : "folded"} · net{" "}
        <span className="tabular-nums">
          {net >= 0 ? "+" : "-"}
          {money.format(Math.abs(net))}
        </span>
      </p>
    </div>
  );
}
