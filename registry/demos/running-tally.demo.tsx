"use client";

import * as React from "react";

import { RunningTally, type TallyEntry } from "@/registry/ui/running-tally";

/** Cents, so a run of postings cannot drift the way floating money does. */
const OPENING = 118000;

const CREDITS = [
  { label: "Waylight payout", amount: 48000, note: "cleared" },
  { label: "Refund", amount: 6240, note: "same day" },
  { label: "Interest", amount: 415, note: "monthly" },
  { label: "Transfer in", amount: 25000, note: "instant" },
];

const DEBITS = [
  { label: "Fernworks invoice", amount: -12840, note: "sent" },
  { label: "Card payment", amount: -4120, note: "authorised" },
  { label: "Standing order", amount: -14800, note: "scheduled" },
  { label: "Fuel", amount: -6210, note: "authorised" },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function RunningTallyDemo() {
  const [entries, setEntries] = React.useState<TallyEntry[]>([]);
  const [posted, setPosted] = React.useState(0);
  const [total, setTotal] = React.useState(OPENING / 100);
  const [last, setLast] = React.useState("");

  const post = (kind: "credit" | "debit") => {
    const script = kind === "credit" ? CREDITS : DEBITS;
    const source = script[posted % script.length];
    if (!source) return;
    setEntries((current) => [
      {
        id: `${kind}-${posted}`,
        label: source.label,
        amount: source.amount / 100,
        note: source.note,
      },
      ...current,
    ]);
    setPosted((count) => count + 1);
    setLast(kind);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <RunningTally
        label="Cleared today"
        entries={entries}
        openingBalance={OPENING / 100}
        onTotalChange={setTotal}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={() => post("credit")}>
          Post credit
        </button>
        <button type="button" className={BUTTON} onClick={() => post("debit")}>
          Post debit
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={entries.length === 0}
          onClick={() => {
            setEntries([]);
            setPosted(0);
            setLast("");
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Total{" "}
        <span className="text-signal tabular-nums">{money.format(total)}</span>{" "}
        · {entries.length} posted{last ? ` · last ${last}` : ""}
      </p>
    </div>
  );
}
