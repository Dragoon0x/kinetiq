"use client";

import * as React from "react";

import { SpendAlert } from "@/registry/ui/spend-alert";

const LIMIT = 450;
const START = 342;
const CHARGE = 38;
const WARN_AT = 0.85;

/** Basinworks Budget, the Groceries card for October — invented merchants. */
const OPENING = [
  { id: "t1", name: "Basin Market", amount: 64 },
  { id: "t2", name: "Coldbrook Diner", amount: 27 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const levelOf = (spent: number) =>
  spent > LIMIT ? "over" : spent / LIMIT >= WARN_AT ? "near" : "clear";

const control =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SpendAlertDemo() {
  const [rows, setRows] = React.useState(OPENING);
  const [spent, setSpent] = React.useState(START);
  const [dismissed, setDismissed] = React.useState(false);

  const level = levelOf(spent);
  const status = dismissed
    ? "dismissed"
    : level === "over"
      ? `over by ${money.format(spent - LIMIT)}`
      : level === "near"
        ? `nearing limit · ${money.format(LIMIT - spent)} left`
        : "clear";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-2 p-3">
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <span className="text-sm font-semibold">Groceries</span>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {money.format(spent)} / {money.format(LIMIT)}
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border-t border-hairline py-1.5"
            >
              <span className="min-w-0 truncate text-xs text-ink-2">
                {row.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums">
                {money.format(row.amount)}
              </span>
            </li>
          ))}
        </ul>

        <SpendAlert
          category="Groceries"
          spent={spent}
          limit={LIMIT}
          warnAt={WARN_AT}
          onOpenChange={(open) => setDismissed(!open)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = spent + CHARGE;
            if (levelOf(next) !== level) setDismissed(false);
            setSpent(next);
            setRows((list) => [
              ...list,
              {
                id: `c${list.length}`,
                name: "Basin Market",
                amount: CHARGE,
              },
            ]);
          }}
          className={control}
        >
          Add charge
        </button>
        <button
          type="button"
          onClick={() => {
            setRows(OPENING);
            setSpent(START);
            setDismissed(false);
          }}
          className={control}
        >
          Reset month
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Groceries {money.format(spent)} of {money.format(LIMIT)} · {status}
      </p>
    </div>
  );
}
