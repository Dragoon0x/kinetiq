"use client";

import * as React from "react";

import { CashClock, type CashOutgoing } from "@/registry/ui/cash-clock";

const START_BALANCE = 2480.15;
const START_DAYS = 12;
const STEP = 3;

const START_OUTGOINGS: CashOutgoing[] = [
  { id: "o1", label: "Rent, Fernworks Lofts", amount: 1150, inDays: 3 },
  { id: "o2", label: "Fieldline broadband", amount: 42, inDays: 6 },
  { id: "o3", label: "Coldbrook loan", amount: 214.55, inDays: 9 },
  { id: "o4", label: "Gaugeworks storage", amount: 18, inDays: 11 },
];

const ALL_IDS = START_OUTGOINGS.map((item) => item.id);

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function CashClockDemo() {
  const [balance, setBalance] = React.useState(START_BALANCE);
  const [days, setDays] = React.useState(START_DAYS);
  const [outgoings, setOutgoings] = React.useState(START_OUTGOINGS);
  const [included, setIncluded] = React.useState<string[]>(ALL_IDS);

  const counted = outgoings.filter((item) => included.includes(item.id));
  const projected = counted.reduce(
    (total, item) => total - item.amount,
    balance,
  );

  const advance = () => {
    // Anything due inside the step has landed: it leaves the balance and the
    // list, and the clock moves with it.
    const landed = outgoings.filter(
      (item) => item.inDays <= STEP && included.includes(item.id),
    );
    setBalance((current) =>
      landed.reduce((total, item) => total - item.amount, current),
    );
    setOutgoings((current) =>
      current
        .filter((item) => item.inDays > STEP)
        .map((item) => ({ ...item, inDays: item.inDays - STEP })),
    );
    setDays((current) => Math.max(0, current - STEP));
  };

  const reset = () => {
    setBalance(START_BALANCE);
    setDays(START_DAYS);
    setOutgoings(START_OUTGOINGS);
    setIncluded(ALL_IDS);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <CashClock
        label="Waylight Pay cycle"
        balance={balance}
        daysToPayday={days}
        outgoings={outgoings}
        included={included}
        onIncludedChange={setIncluded}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={days === 0}
          onClick={advance}
        >
          Advance {STEP} days
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={days === START_DAYS && balance === START_BALANCE}
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Projected{" "}
        <span className="text-signal tabular-nums">{projected.toFixed(2)}</span>{" "}
        at payday · <span className="tabular-nums">{days}</span> days ·{" "}
        <span className="tabular-nums">{counted.length}</span> of{" "}
        <span className="tabular-nums">{outgoings.length}</span> scheduled
      </p>
    </div>
  );
}
