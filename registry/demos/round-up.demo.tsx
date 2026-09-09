"use client";

import * as React from "react";

import { RoundUp, type RoundUpPurchase } from "@/registry/ui/round-up";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A day on a Waylight Pay card; the parking is already whole, so no change. */
const SCRIPT: RoundUpPurchase[] = [
  {
    id: "p1",
    merchant: "Coldbrook Coffee",
    amount: 4.35,
    note: "Card · 08:12",
  },
  {
    id: "p2",
    merchant: "Fernworks Transit",
    amount: 2.6,
    note: "Card · 08:40",
  },
  { id: "p3", merchant: "Basin Grocers", amount: 23.12, note: "Card · 12:05" },
  { id: "p4", merchant: "Gaugeworks Parking", amount: 6, note: "Card · 13:30" },
  {
    id: "p5",
    merchant: "Fieldline Books",
    amount: 18.49,
    note: "Card · 17:15",
  },
  { id: "p6", merchant: "Waylight Fuel", amount: 41.2, note: "Card · 18:02" },
];

const START = 14.2;

export function RoundUpDemo() {
  const [index, setIndex] = React.useState(0);
  const [saved, setSaved] = React.useState(START);
  const [enabled, setEnabled] = React.useState(true);
  const [last, setLast] = React.useState<number | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RoundUp
        purchase={SCRIPT[index] ?? null}
        saved={saved}
        onSavedChange={(next, change) => {
          setSaved(next);
          setLast(change);
        }}
        enabled={enabled}
        onEnabledChange={setEnabled}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setIndex((prev) => (prev + 1) % SCRIPT.length)}
          className="h-8 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Next purchase
        </button>
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setSaved(START);
            setLast(null);
          }}
          className="h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {enabled
          ? `Round-ups ${money.format(saved)}${
              last !== null ? ` · last +${money.format(last)}` : ""
            }`
          : `Round-ups paused · ${money.format(saved)}`}
      </p>
    </div>
  );
}
