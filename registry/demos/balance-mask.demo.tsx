"use client";

import * as React from "react";

import { BalanceMask } from "@/registry/ui/balance-mask";

const START = 12480.9;
const PAY_IN = 420;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function BalanceMaskDemo() {
  const [amount, setAmount] = React.useState(START);
  const [shown, setShown] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium">
            Coldbrook current
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3">
            ····4193
          </span>
        </div>

        <BalanceMask
          label="Available balance"
          amount={amount}
          revealed={shown}
          onRevealedChange={setShown}
          hint="Hold to show · Space toggles"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setAmount((current) => current + PAY_IN)}
        >
          Pay in {PAY_IN.toFixed(2)}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={amount === START}
          onClick={() => setAmount(START)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Balance{" "}
        <span className="text-signal">{shown ? "shown" : "hidden"}</span> ·{" "}
        {shown ? (
          <span className="tabular-nums">{amount.toFixed(2)}</span>
        ) : (
          "hold or press space"
        )}
      </p>
    </div>
  );
}
