"use client";

import * as React from "react";

import {
  GoalThermometer,
  type GoalEntry,
  type GoalState,
} from "@/registry/ui/goal-thermometer";

/** Amounts are held in cents so the envelope cannot drift the way floats do. */
const spend = (id: string, label: string, cents: number): GoalEntry => ({
  id,
  label,
  amount: cents / 100,
});

const SCRIPT: GoalEntry[] = [
  spend("e1", "Ferngate Market", 8620),
  spend("e2", "Halyard Coffee", 4235),
  spend("e3", "Marrow & Vine", 12890),
  spend("e4", "Lantern Books", 2460),
  spend("e5", "Ferngate Market", 9650),
  spend("e6", "Tallow Hardware", 5800),
  spend("e7", "Basin Grocers", 7415),
  spend("e8", "Ferngate Market", 6130),
  spend("e9", "Marrow & Vine", 6840),
];

const CAP = 600;
const OPENING = 5;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WORDS: Record<GoalState, string> = {
  under: "under cap",
  near: "near cap",
  over: "over cap",
};

const button =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function GoalThermometerDemo() {
  const [count, setCount] = React.useState(OPENING);
  const [state, setState] = React.useState<GoalState>("under");

  const entries = SCRIPT.slice(0, count);
  const spent = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const share = Math.round((spent / CAP) * 100);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GoalThermometer
        label="Groceries · November"
        entries={entries}
        cap={CAP}
        onStateChange={setState}
        format={(value) => money.format(value)}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={count >= SCRIPT.length}
          onClick={() => setCount((at) => Math.min(SCRIPT.length, at + 1))}
          className={button}
        >
          Add expense
        </button>
        <button
          type="button"
          disabled={count === OPENING}
          onClick={() => setCount(OPENING)}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Groceries ·{" "}
        <span className="text-signal tabular-nums">{money.format(spent)}</span>{" "}
        of <span className="tabular-nums">{money.format(CAP)}</span> ·{" "}
        <span className="tabular-nums">{share}%</span> ·{" "}
        <span className="tabular-nums">{entries.length}</span> expenses ·{" "}
        {WORDS[state]}
      </p>
    </div>
  );
}
