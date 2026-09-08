"use client";

import * as React from "react";

import { BalanceCompare } from "@/registry/ui/balance-compare";

const JULY = { label: "Jul", amount: 4120 };

/** Seeded outcomes — up, down, level — so the demo never depends on chance. */
const AUGUSTS = [4690.5, 3566.4, 4120] as const;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function BalanceCompareDemo() {
  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);

  const august = { label: "Aug", amount: AUGUSTS[index] ?? AUGUSTS[0] };
  const delta = august.amount - JULY.amount;
  const percent = (delta / JULY.amount) * 100;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "level";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <BalanceCompare
        label="Fernworks payouts"
        from={JULY}
        to={august}
        onRevealChange={setRevealed}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setIndex((current) => (current + 1) % AUGUSTS.length)}
        >
          Next August
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Aug{" "}
        <span className="text-signal tabular-nums">
          {august.amount.toFixed(2)}
        </span>{" "}
        ·{" "}
        {direction === "level"
          ? "level on jul"
          : `${direction} ${Math.abs(percent).toFixed(1)}% on jul`}
        {revealed ? " · line drawn" : ""}
      </p>
    </div>
  );
}
