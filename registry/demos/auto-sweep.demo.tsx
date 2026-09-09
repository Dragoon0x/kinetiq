"use client";

import * as React from "react";

import { AutoSweep } from "@/registry/ui/auto-sweep";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const KEEP = 1000;
const OPENING = { balance: 1084.2, savings: 3410 };
/** Waylight Pay month ends, and the pay-in that lands above the floor each time. */
const PERIODS = ["30 Sep", "31 Oct", "30 Nov", "31 Dec", "31 Jan", "28 Feb"];
const PAY_INS = [132.6, 96.45, 210.3, 58.75, 174.9];

const round2 = (value: number) => Math.round(value * 100) / 100;

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Phase =
  | { kind: "idle" }
  | { kind: "sweeping"; amount: number }
  | { kind: "swept"; amount: number };

export function AutoSweepDemo() {
  const [balance, setBalance] = React.useState(OPENING.balance);
  const [savings, setSavings] = React.useState(OPENING.savings);
  const [month, setMonth] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });

  const leftover = round2(Math.max(0, balance - KEEP));
  const canAdvance = month < PERIODS.length - 1;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AutoSweep
        label="Month-end sweep"
        period={`Month end · ${PERIODS[month]}`}
        balance={balance}
        savings={savings}
        keep={KEEP}
        onSweep={(amount) => {
          setBalance((prev) => round2(prev - amount));
          setSavings((prev) => round2(prev + amount));
          setPhase({ kind: "sweeping", amount });
        }}
        onSettle={(amount) => setPhase({ kind: "swept", amount })}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          aria-disabled={!canAdvance || undefined}
          onClick={() => {
            if (!canAdvance) return;
            setBalance((prev) => round2(prev + (PAY_INS[month] ?? 0)));
            setMonth((prev) => prev + 1);
            setPhase({ kind: "idle" });
          }}
        >
          Next month
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setBalance(OPENING.balance);
            setSavings(OPENING.savings);
            setMonth(0);
            setPhase({ kind: "idle" });
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase.kind === "sweeping"
          ? `Sweeping ${money.format(phase.amount)}`
          : phase.kind === "swept"
            ? `Swept ${money.format(phase.amount)} · Savings ${money.format(savings)}`
            : `Leftover ${money.format(leftover)} · Savings ${money.format(savings)}`}
      </p>
    </div>
  );
}
