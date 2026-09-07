"use client";

import * as React from "react";

import { FabFan } from "@/registry/ui/fab-fan";

const LEDGER = [
  { id: "l1", who: "Fernworks Ltd", note: "Invoice 4471", amount: "+1,240.00" },
  { id: "l2", who: "Waylight", note: "Subscription", amount: "−18.00" },
  { id: "l3", who: "M. Okonjo", note: "Split · dinner", amount: "−32.50" },
];

export function FabFanDemo() {
  const [last, setLast] = React.useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="relative h-[240px] w-full overflow-hidden rounded-3 border border-border bg-surface-1">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">Coldbrook</span>
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              ·· 4409
            </span>
          </div>
          <ul className="flex flex-col">
            {LEDGER.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 border-b border-hairline py-2 last:border-0"
              >
                <span className="min-w-0 truncate text-xs">
                  <span className="font-medium">{row.who}</span>
                  <span className="text-ink-3"> · {row.note}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <FabFan
          label="New"
          actions={[
            {
              id: "transfer",
              label: "Transfer",
              icon: "transfer",
              onSelect: () => setLast("Transfer"),
            },
            {
              id: "request",
              label: "Request",
              icon: "request",
              onSelect: () => setLast("Request"),
            },
            {
              id: "split",
              label: "Split",
              icon: "split",
              onSelect: () => setLast("Split"),
            },
            {
              id: "note",
              label: "Note",
              icon: "note",
              onSelect: () => setLast("Note"),
            },
            {
              id: "scan",
              label: "Scan",
              icon: "scan",
              onSelect: () => setLast("Scan"),
            },
          ]}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            Started <span className="text-signal">{last}</span>
          </>
        ) : (
          "Open the fan to start something"
        )}
      </p>
    </div>
  );
}
