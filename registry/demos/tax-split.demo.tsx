"use client";

import * as React from "react";

import { splitTax, TaxSplit, type TaxMode } from "@/registry/ui/tax-split";

const RATE = 0.2;
const AMOUNTS = [120, 249, 1080];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border px-3 font-mono text-xs tabular-nums outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function TaxSplitDemo() {
  const [amount, setAmount] = React.useState(AMOUNTS[0] ?? 120);
  const [mode, setMode] = React.useState<TaxMode>("exclusive");
  const { net, tax, total } = splitTax(amount, RATE, mode);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <TaxSplit
        label="Studio plan"
        amount={amount}
        rate={RATE}
        mode={mode}
        onModeChange={setMode}
      />

      <div className="flex flex-wrap gap-2" aria-label="Amount">
        {AMOUNTS.map((preset) => {
          const active = preset === amount;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => setAmount(preset)}
              className={`${BUTTON} ${
                active
                  ? "border-hairline-strong bg-cobalt-wash text-foreground"
                  : "border-input bg-surface-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {money.format(preset)}
            </button>
          );
        })}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{mode}</span>
        {` · net ${money.format(net)} · tax ${money.format(tax)} · total ${money.format(total)}`}
      </p>
    </div>
  );
}
