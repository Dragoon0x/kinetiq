"use client";

import * as React from "react";

import { LedgerLine } from "@/registry/ui/ledger-line";

const ENTRIES = [
  {
    id: "e1",
    title: "Fernworks Supply",
    amount: -128.4,
    date: "8 Sep",
    merchant: "Fernworks Supply Co",
    category: "Hardware",
    runningBalance: 8412.6,
    reference: "REF 4K2-8810",
  },
  {
    id: "e2",
    title: "Coldbrook transfer",
    amount: 2480,
    date: "6 Sep",
    merchant: "Coldbrook Bank",
    category: "Income",
    runningBalance: 8541,
    reference: "REF 4K2-8802",
  },
  {
    id: "e3",
    title: "Basinworks Exchange",
    amount: -62.4,
    date: "5 Sep",
    merchant: "Basinworks Exchange",
    category: "Services",
    runningBalance: 6061,
    reference: "REF 4K2-8797",
  },
  {
    id: "e4",
    title: "Gaugeworks Cafe",
    amount: -8.9,
    date: "5 Sep",
    merchant: "Gaugeworks Cafe",
    category: "Food",
    runningBalance: 6123.4,
    reference: "REF 4K2-8791",
  },
];

const PENDING_ID = "e3";

export function LedgerLineDemo() {
  const [openId, setOpenId] = React.useState<string | null>("e1");
  const [settled, setSettled] = React.useState(false);

  const open = ENTRIES.find((entry) => entry.id === openId);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {ENTRIES.map((entry) => (
          <li key={entry.id}>
            <LedgerLine
              title={entry.title}
              amount={entry.amount}
              date={entry.date}
              status={
                entry.id === PENDING_ID && !settled ? "pending" : "settled"
              }
              merchant={entry.merchant}
              category={entry.category}
              runningBalance={entry.runningBalance}
              reference={entry.reference}
              open={openId === entry.id}
              onOpenChange={(next) => setOpenId(next ? entry.id : null)}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={settled}
        onClick={() => setSettled(true)}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Settle pending
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            Open <span className="text-signal">{open.title}</span>
          </>
        ) : (
          "All rows closed"
        )}{" "}
        · {settled ? "0" : "1"} pending
      </p>
    </div>
  );
}
