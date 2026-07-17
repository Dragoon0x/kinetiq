"use client";

import * as React from "react";

import { BalanceQuote } from "@/registry/ui/balance-quote";

export function BalanceQuoteDemo() {
  const [run, setRun] = React.useState(0);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="border-hairline bg-surface-1 min-h-32 rounded-3 border p-5">
        <BalanceQuote key={run} cite="Calibration manual · plate 1">
          A control should answer the hand before the eye has time to doubt it.
        </BalanceQuote>
      </div>

      <button
        type="button"
        onClick={() => setRun((value) => value + 1)}
        className="border-input hover:bg-accent self-start rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
      >
        Replay
      </button>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Lines{" "}
        <span className="text-[var(--signal,var(--primary))]">
          balanced, word cascade
        </span>
      </p>
    </div>
  );
}
