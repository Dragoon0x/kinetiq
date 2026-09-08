"use client";

import * as React from "react";

import { ConfirmSlab, type ConfirmStage } from "@/registry/ui/confirm-slab";

const AMOUNT = 1240;
const FEE = 2.4;
const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const WORDS: Record<ConfirmStage, string> = {
  idle: "ready",
  detent: "held at detent",
  sent: `sent ${MONEY.format(AMOUNT + FEE)}`,
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ConfirmSlabDemo() {
  const [round, setRound] = React.useState(0);
  const [status, setStatus] = React.useState("ready");

  const rebuild = (next: string) => {
    setStatus(next);
    setRound((value) => value + 1);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ConfirmSlab
        key={round}
        amount={AMOUNT}
        fee={FEE}
        recipient="Coldbrook Bank"
        account="•••• 8820"
        note="Basinworks payout 2418"
        confirmLabel="Slide to send"
        onStageChange={(stage) => setStatus(WORDS[stage])}
        onCancel={() => rebuild("cancelled")}
      />

      <button
        type="button"
        className={`${BUTTON} self-start`}
        onClick={() => rebuild("ready")}
      >
        Review again
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Basinworks payout{" "}
        <span className="text-cobalt-bright tabular-nums">{status}</span>
      </p>
    </div>
  );
}
