"use client";

import * as React from "react";

import { TipPick, type TipValue } from "@/registry/ui/tip-pick";

const SUBTOTAL = 64;

const money = (value: number) => `$${value.toFixed(2)}`;

const tipOf = (tip: TipValue): number => {
  if (tip.kind === "none") return 0;
  const raw = tip.kind === "amount" ? tip.value : (SUBTOTAL * tip.value) / 100;
  return Math.max(0, Math.round(raw * 100) / 100);
};

export function TipPickDemo() {
  const [tip, setTip] = React.useState<TipValue>({
    kind: "percent",
    value: 15,
  });
  const amount = tipOf(tip);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1 p-4">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold text-foreground">
            Coldbrook · table 6
          </span>
          <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            2 covers
          </span>
        </div>
        <TipPick
          subtotal={SUBTOTAL}
          value={tip}
          onValueChange={setTip}
          format={money}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Tip <span className="text-signal">{money(amount)}</span> · total{" "}
        <span className="text-signal">{money(SUBTOTAL + amount)}</span>
      </p>
    </div>
  );
}
