"use client";

import * as React from "react";

import { ReserveGauge, type ReserveHold } from "@/registry/ui/reserve-gauge";

const TOTAL = 1284.6;

const START: ReserveHold[] = [
  {
    id: "h1",
    amount: 84,
    reason: "Card pre-authorisation, Waylight Fuel",
    clears: "clears Thursday",
  },
  {
    id: "h2",
    amount: 190,
    reason: "Outbound transfer, Fernworks rent",
    clears: "clears at settlement",
  },
  {
    id: "h3",
    amount: 44.4,
    reason: "Merchant deposit, Coldbrook Supply",
    clears: "clears in two days",
  },
];

/** Seeded, so the demo behaves the same on every render and every machine. */
const EXTRA: ReserveHold[] = [
  {
    id: "h4",
    amount: 126.5,
    reason: "Card pre-authorisation, Basinworks Hotel",
    clears: "clears on checkout",
  },
  {
    id: "h5",
    amount: 61.75,
    reason: "Disputed charge under review",
    clears: "clears when the dispute closes",
  },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function ReserveGaugeDemo() {
  const [holds, setHolds] = React.useState(START);
  const [readingId, setReadingId] = React.useState<string | null>(null);

  const held = holds.reduce((sum, hold) => sum + hold.amount, 0);
  const reading = holds.find((hold) => hold.id === readingId);
  const next = EXTRA.find((hold) => !holds.some((one) => one.id === hold.id));

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <ReserveGauge
        label="Coldbrook current account"
        total={TOTAL}
        holds={holds}
        onHoldReveal={setReadingId}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={holds.length === 0}
          onClick={() => setHolds((current) => current.slice(1))}
        >
          Clear oldest
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!next}
          onClick={() =>
            setHolds((current) => (next ? [...current, next] : current))
          }
        >
          Add hold
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={holds === START}
          onClick={() => setHolds(START)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Available{" "}
        <span className="text-signal tabular-nums">
          {(TOTAL - held).toFixed(2)}
        </span>{" "}
        · {holds.length} holds{" "}
        <span className="tabular-nums">{held.toFixed(2)}</span>
        {reading ? ` · reading ${reading.reason}` : ""}
      </p>
    </div>
  );
}
