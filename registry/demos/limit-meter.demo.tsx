"use client";

import * as React from "react";

import { LimitMeter, type LimitEntry } from "@/registry/ui/limit-meter";

const LIMIT = 2000;
const STEP = 250;
const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SEED: LimitEntry[] = [
  { id: "s1", amount: 420, label: "Fernworks Supply" },
  { id: "s2", amount: 180, label: "Coldbrook Bank" },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function LimitMeterDemo() {
  const [entries, setEntries] = React.useState<LimitEntry[]>(SEED);
  const [staged, setStaged] = React.useState(250);

  const used = entries.reduce((total, entry) => total + entry.amount, 0);
  const over = Math.max(0, used + staged - LIMIT);

  const status = over
    ? `over by ${MONEY.format(over)}`
    : staged > 0
      ? `staging ${MONEY.format(staged)}`
      : `${MONEY.format(LIMIT - used)} left`;

  const confirm = () => {
    setEntries((current) => [
      ...current,
      { id: `s${current.length + 1}`, amount: staged, label: "Waylight send" },
    ]);
    setStaged(0);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <LimitMeter
        entries={entries}
        limit={LIMIT}
        pending={staged}
        label="Waylight Pay daily limit"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setStaged((value) => Math.min(LIMIT, value + STEP))}
        >
          Stage +{STEP}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={staged <= 0}
          onClick={() => setStaged((value) => Math.max(0, value - STEP))}
        >
          Stage −{STEP}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={staged <= 0 || over > 0}
          onClick={confirm}
        >
          Confirm
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={entries === SEED && staged === 250}
          onClick={() => {
            setEntries(SEED);
            setStaged(250);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight Pay{" "}
        <span className="text-cobalt-bright tabular-nums">{status}</span>
      </p>
    </div>
  );
}
