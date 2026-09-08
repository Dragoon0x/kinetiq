"use client";

import * as React from "react";

import {
  TransferReceipt,
  type ReceiptLine,
} from "@/registry/ui/transfer-receipt";

const LINES: ReceiptLine[] = [
  { id: "payee", label: "Payee", value: "Fernworks Supply" },
  { id: "account", label: "Account", value: "•••• 4417" },
  { id: "fee", label: "Fee", amount: 0.4 },
  { id: "total", label: "Total taken", amount: 320.4, emphasis: true },
  { id: "arrival", label: "Arrives", value: "Within an hour" },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function TransferReceiptDemo() {
  const [sent, setSent] = React.useState(false);
  const [copy, setCopy] = React.useState<string | null>(null);

  const status = !sent ? "idle" : (copy ?? "printed");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          Waylight Pay · Fernworks Supply
        </span>
        <span className="shrink-0 font-mono text-sm tabular-nums">320.00</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={sent}
          onClick={() => {
            setCopy(null);
            setSent(true);
          }}
        >
          Send 320.00
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!sent}
          onClick={() => {
            setCopy(null);
            setSent(false);
          }}
        >
          New transfer
        </button>
      </div>

      <TransferReceipt
        open={sent}
        amount={320}
        lines={LINES}
        reference="WAY-4K7Q-2318"
        title="Waylight Pay receipt"
        onCopy={(_, ok) => setCopy(ok ? "reference copied" : "copy blocked")}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight Pay <span className="text-cobalt-bright">{status}</span>
      </p>
    </div>
  );
}
