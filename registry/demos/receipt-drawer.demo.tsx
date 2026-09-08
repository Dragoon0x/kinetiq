"use client";

import * as React from "react";

import {
  matchReceipt,
  ReceiptDrawer,
  type Receipt,
} from "@/registry/ui/receipt-drawer";

const RECEIPTS: Receipt[] = [
  {
    id: "r-1041",
    merchant: "Coldbrook Cafe",
    date: "Sep 2",
    amount: 14.6,
    items: [
      { label: "Flat white × 2", amount: 9.2 },
      { label: "Seed loaf", amount: 5.4 },
    ],
    note: "Client breakfast",
  },
  {
    id: "r-1042",
    merchant: "Basin Transit",
    date: "Sep 3",
    amount: 22,
    items: [
      { label: "Day pass", amount: 11 },
      { label: "Day pass", amount: 11 },
    ],
  },
  {
    id: "r-1043",
    merchant: "Fernworks Supply",
    date: "Sep 4",
    amount: 86.35,
    items: [
      { label: "Field notebooks × 5", amount: 42.5 },
      { label: "Marker set", amount: 31.85 },
      { label: "Shipping", amount: 12 },
    ],
  },
  {
    id: "r-1044",
    merchant: "Waylight Cloud",
    date: "Sep 5",
    amount: 48,
    items: [{ label: "Studio plan · September", amount: 48 }],
    note: "Monthly",
  },
  {
    id: "r-1045",
    merchant: "Coldbrook Cafe",
    date: "Sep 6",
    amount: 7.8,
    items: [{ label: "Cold brew × 2", amount: 7.8 }],
  },
];

export function ReceiptDrawerDemo() {
  const [open, setOpen] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const shown = RECEIPTS.filter((receipt) => matchReceipt(receipt, query));
  const openReceipt = RECEIPTS.find((receipt) => receipt.id === expanded);
  const trimmed = query.trim();

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <ReceiptDrawer
        label="Fieldline expenses"
        receipts={RECEIPTS}
        open={open}
        onOpenChange={setOpen}
        query={query}
        onQueryChange={setQuery}
        expandedId={expanded}
        onExpandedChange={setExpanded}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            Drawer open ·{" "}
            <span className="text-signal tabular-nums">
              {trimmed
                ? `${shown.length} match "${trimmed}"`
                : `${RECEIPTS.length} of ${RECEIPTS.length}`}
            </span>
            {" · "}
            {openReceipt ? `${openReceipt.merchant} open` : "none open"}
          </>
        ) : (
          <>
            Drawer closed ·{" "}
            <span className="text-signal tabular-nums">{RECEIPTS.length}</span>{" "}
            filed
          </>
        )}
      </p>
    </div>
  );
}
