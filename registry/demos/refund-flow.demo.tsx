"use client";

import * as React from "react";

import { RefundFlow } from "@/registry/ui/refund-flow";

const ORIGINAL = 48;
const CARD = "•• 4182";
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function RefundFlowDemo() {
  const [charge, setCharge] = React.useState(1);
  const [amount, setAmount] = React.useState(ORIGINAL);
  const [refunded, setRefunded] = React.useState<number | null>(null);

  const newCharge = () => {
    setCharge((previous) => previous + 1);
    setAmount(ORIGINAL);
    setRefunded(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* Keyed by charge: a new charge is a new card, not a refunded one reset. */}
      <RefundFlow
        key={charge}
        merchant="Fieldline Supply"
        original={ORIGINAL}
        cardLabel={CARD}
        value={amount}
        onValueChange={setAmount}
        onRefund={setRefunded}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={newCharge}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          New charge
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {refunded === null ? (
          <>
            Refund{" "}
            <span className="text-cobalt-bright tabular-nums">
              {MONEY.format(amount)} of {MONEY.format(ORIGINAL)}
            </span>{" "}
            · {amount >= ORIGINAL ? "full" : amount > 0 ? "partial" : "none"}
          </>
        ) : (
          <span className="text-success tabular-nums">
            Refunded {MONEY.format(refunded)} to {CARD}
          </span>
        )}
      </p>
    </div>
  );
}
