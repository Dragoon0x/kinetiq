"use client";

import * as React from "react";

import { ReceiptCard, type ReceiptLine } from "@/registry/ui/receipt-card";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const RECEIPTS = [
  {
    id: "depot",
    merchant: "Coldbrook Supply",
    date: "4 March",
    reference: "CBS-4471",
    lines: [
      { id: "lantern", label: "Basin Quay lantern", qty: 2, amount: 96 },
      { id: "tarp", label: "Fernworks tarp", amount: 34 },
      { id: "torch", label: "Waylight head torch", amount: 26 },
      { id: "flask", label: "Coldbrook flask", qty: 3, amount: 57 },
      { id: "rope", label: "Basinworks rope, 20 metres", amount: 18 },
    ] satisfies ReceiptLine[],
    extras: [
      { id: "delivery", label: "Depot delivery", amount: 7.4 },
    ] satisfies ReceiptLine[],
  },
  {
    id: "coffee",
    merchant: "Fernworks Canteen",
    date: "5 March",
    reference: "FWC-0212",
    lines: [
      { id: "coffee", label: "Long coffee", qty: 2, amount: 6.4 },
      { id: "roll", label: "Morning roll", amount: 3.2 },
    ] satisfies ReceiptLine[],
    extras: [] satisfies ReceiptLine[],
  },
];

export function ReceiptCardDemo() {
  const [which, setWhich] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const receipt = RECEIPTS[which] ?? RECEIPTS[0];
  const all = [...(receipt?.lines ?? []), ...(receipt?.extras ?? [])];
  const total = all.reduce(
    (sum, line) => sum + Math.round(line.amount * 100),
    0,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ol role="list" className="flex flex-col gap-2">
        <li className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-3">Rui Baptista · 16:41</span>
          <span className="text-sm leading-snug">Paid for the depot run.</span>
          {receipt ? (
            <ReceiptCard
              merchant={receipt.merchant}
              date={receipt.date}
              reference={receipt.reference}
              lines={receipt.lines}
              extras={receipt.extras}
              open={open}
              onOpenChange={setOpen}
            />
          ) : null}
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} className={chip}>
          {open ? "Fold" : "Unroll"}
        </button>
        <button
          type="button"
          onClick={() => setWhich(which === 0 ? 1 : 0)}
          className={chip}
        >
          Second receipt
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? `Open · ${all.length} lines · ` : "Folded · paid · "}
        <span className="text-signal">{money.format(total / 100)}</span>
      </p>
    </div>
  );
}
