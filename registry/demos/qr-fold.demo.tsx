"use client";

import * as React from "react";

import { QrFold } from "@/registry/ui/qr-fold";

const ADDRESS = "bsn1q7f4c2m8xk3vd9puew5t0lrn6ha2js4c";
/** The same head-and-tail the chip prints, so the two never disagree. */
const SHORT = `${ADDRESS.slice(0, 8)}…${ADDRESS.slice(-6)}`;
/** Seeded, so the demo asks for the same run of amounts on every render pass. */
const AMOUNTS = [180, 42.5, 1250, 96.4];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function QrFoldDemo() {
  const [step, setStep] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState<"ok" | "failed" | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <QrFold
        label="Receive"
        network="Basin"
        address={ADDRESS}
        amount={AMOUNTS[step % AMOUNTS.length]}
        open={open}
        onOpenChange={setOpen}
        onCopy={(_address, ok) => setCopied(ok ? "ok" : "failed")}
      />

      <button
        type="button"
        className={BUTTON}
        onClick={() => setStep((current) => current + 1)}
      >
        Request another amount
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Code <span className="text-signal">{open ? "shown" : "hidden"}</span> ·
        Address <span className="tabular-nums">{SHORT}</span>
        {copied === null
          ? null
          : copied === "ok"
            ? " · copied"
            : " · copy blocked"}
      </p>
    </div>
  );
}
