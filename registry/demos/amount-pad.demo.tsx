"use client";

import * as React from "react";

import { AmountPad } from "@/registry/ui/amount-pad";

const LIMIT = 500;

const money = (value: number, digits: number) => `$${value.toFixed(digits)}`;

export function AmountPadDemo() {
  const [amount, setAmount] = React.useState(0);
  const [refused, setRefused] = React.useState<number | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <AmountPad
          label="To Basinworks Exchange"
          value={amount}
          onValueChange={(next) => {
            setAmount(next);
            setRefused(null);
          }}
          limit={LIMIT}
          onLimitReached={setRefused}
          format={money}
          caption={`Daily limit ${money(LIMIT, 2)} · resets at midnight`}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAmount(0);
              setRefused(null);
            }}
            className="flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              const rounded = Math.min(LIMIT, Math.ceil(amount));
              setAmount(rounded);
              setRefused(null);
            }}
            className="flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Round up
          </button>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Amount <span className="text-signal">{money(amount, 2)}</span> ·{" "}
        {refused === null ? (
          <>
            limit <span className="text-signal">{money(LIMIT, 2)}</span>
          </>
        ) : (
          <>
            refused <span className="text-danger">{money(refused, 2)}</span>
          </>
        )}
      </p>
    </div>
  );
}
