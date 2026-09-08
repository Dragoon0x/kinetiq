"use client";

import * as React from "react";

import { HarvestTap } from "@/registry/ui/harvest-tap";

const SEED_BALANCE = 1250;
const SEED_ACCRUED = 3.6;
const RATE = 0.42;

const amounts = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const buttonClass =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function HarvestTapDemo() {
  const [run, setRun] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [balance, setBalance] = React.useState(SEED_BALANCE);
  const [taken, setTaken] = React.useState({ count: 0, total: 0 });

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HarvestTap
        // A fresh run remounts the tap, so the accrued figure returns to its
        // seed rather than carrying the last run's climb.
        key={run}
        label="Basinworks Exchange"
        balance={balance}
        accrued={SEED_ACCRUED}
        rate={RATE}
        accruing={open}
        symbol="BSN"
        minHarvest={1}
        onHarvest={(amount) => {
          setBalance((value) => value + amount);
          setTaken((prev) => ({
            count: prev.count + 1,
            total: prev.total + amount,
          }));
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={buttonClass}
        >
          {open ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          disabled={balance === SEED_BALANCE && taken.count === 0 && !open}
          onClick={() => {
            setOpen(false);
            setBalance(SEED_BALANCE);
            setTaken({ count: 0, total: 0 });
            setRun((value) => value + 1);
          }}
          className={buttonClass}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Balance{" "}
        <span className="text-signal tabular-nums">
          {amounts.format(balance)} BSN
        </span>{" "}
        · tap {open ? "open" : "closed"} · harvested{" "}
        <span className="text-signal tabular-nums">
          {taken.count}× {amounts.format(taken.total)} BSN
        </span>
      </p>
    </div>
  );
}
