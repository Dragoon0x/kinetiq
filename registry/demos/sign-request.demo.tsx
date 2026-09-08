"use client";

import * as React from "react";

import { SignRequest, type SignField } from "@/registry/ui/sign-request";

const FIELDS: SignField[] = [
  { id: "method", label: "Method", value: "approveSpend" },
  {
    id: "contract",
    label: "Contract",
    value: "bsn1q4v8m2xk7ptl93hazr6ye0jf5cw",
  },
  { id: "spender", label: "Spender", value: "Basinworks Exchange router" },
  { id: "allowance", label: "Allowance", value: "Unlimited", tone: "warn" },
  { id: "network", label: "Network", value: "Basin · BSN" },
  { id: "fee", label: "Network fee", amount: 0.0042 },
  { id: "nonce", label: "Nonce", amount: 118 },
  { id: "expires", label: "Expires", value: "In 30 minutes" },
  { id: "wallet", label: "Signing wallet", value: "Waylight · bsn1q9f4…cwyd" },
];

const ACTIVITY = [
  { id: "a", label: "Received · Coldbrook Bank", delta: "+40.00" },
  { id: "b", label: "Sent · Fernworks Supply", delta: "−12.25" },
  { id: "c", label: "Received · Gaugeworks", delta: "+6.10" },
  { id: "d", label: "Sent · Basinworks Exchange", delta: "−3.00" },
];

const bsn = (value: number) => `${value} BSN`;

export function SignRequestDemo() {
  const [open, setOpen] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [outcome, setOutcome] = React.useState<"idle" | "signed" | "rejected">(
    "idle",
  );

  const state = open
    ? `open · ${armed ? "armed" : "reading"}`
    : outcome === "idle"
      ? "idle"
      : outcome;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Waylight Wallet</span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3">
            bsn1q9f4…cwyd
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-2xl tabular-nums">128.40</span>
          <span className="text-[11px] text-ink-3">BSN on Basin</span>
        </div>

        <ul className="flex flex-col gap-1.5 text-[11px] text-ink-2">
          {ACTIVITY.map((row) => (
            <li
              key={row.id}
              className="flex justify-between gap-3 border-b border-hairline pb-1.5 last:border-b-0 last:pb-0"
            >
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {row.delta}
              </span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setOutcome("idle");
            setOpen(true);
          }}
          className="flex h-9 items-center justify-center rounded-2 border border-input bg-surface-1 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Review request
        </button>

        <SignRequest
          open={open}
          fields={FIELDS}
          origin="Basinworks Exchange"
          format={bsn}
          onArmedChange={setArmed}
          onSign={() => {
            setOutcome("signed");
            setOpen(false);
          }}
          onReject={() => {
            setOutcome("rejected");
            setOpen(false);
          }}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Sign request <span className="text-signal">{state}</span>
      </p>
    </div>
  );
}
