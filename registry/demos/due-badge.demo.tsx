"use client";

import * as React from "react";

import { DueBadge, type DueStatus } from "@/registry/ui/due-badge";

const STATES: { value: DueStatus; label: string; days?: number }[] = [
  { value: "due", label: "Due", days: 4 },
  { value: "overdue", label: "Overdue", days: 2 },
  { value: "paid", label: "Paid" },
];

const AMOUNT = 340;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function DueBadgeDemo() {
  const [status, setStatus] = React.useState<DueStatus>("due");
  const current = STATES.find((state) => state.value === status);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              Basinworks Freight
            </div>
            <div className="truncate text-xs text-ink-3">
              Invoice 4821 · Coldbrook Bank
            </div>
          </div>
          <span className="shrink-0 font-mono text-sm text-foreground tabular-nums">
            {money.format(AMOUNT)}
          </span>
        </div>

        <DueBadge
          status={status}
          days={current?.days}
          amount={AMOUNT}
          name="Invoice 4821"
          className="self-start"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {STATES.map((state) => (
          <button
            key={state.value}
            type="button"
            aria-pressed={status === state.value}
            onClick={() => setStatus(state.value)}
            className={
              "inline-flex h-8 items-center justify-center rounded-2 border px-3 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
              (status === state.value
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input bg-surface-1 text-foreground hover:bg-accent")
            }
          >
            {state.label}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Invoice 4821 · <span className="text-signal">{status}</span> ·{" "}
        {money.format(AMOUNT)}
      </p>
    </div>
  );
}
