"use client";

import * as React from "react";

import { SettlePulse, type SettleStatus } from "@/registry/ui/settle-pulse";

const AMOUNT = 240;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const STEPS: { value: SettleStatus; label: string }[] = [
  { value: "settled", label: "Settle" },
  { value: "returned", label: "Return" },
  { value: "pending", label: "Reset" },
];

export function SettlePulseDemo() {
  const [status, setStatus] = React.useState<SettleStatus>("pending");

  const line = status === "pending" ? "pending on coldbrook bank" : status;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-medium">
            Coldbrook Bank
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            Waylight Pay
          </span>
        </div>
        <SettlePulse status={status} amount={AMOUNT} network="Coldbrook Bank" />
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((step) => (
          <button
            key={step.value}
            type="button"
            className={BUTTON}
            disabled={status === step.value}
            onClick={() => setStatus(step.value)}
          >
            {step.label}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight Pay <span className="tabular-nums">240.00</span>{" "}
        <span className="text-cobalt-bright">{line}</span>
      </p>
    </div>
  );
}
