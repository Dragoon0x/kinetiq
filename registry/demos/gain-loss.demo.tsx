"use client";

import * as React from "react";

import {
  GainLoss,
  type GainLossHolding,
  type GainLossSort,
} from "@/registry/ui/gain-loss";

const HOLDINGS: GainLossHolding[] = [
  { id: "bsn", label: "BSN", change: 1240, percent: 6.8 },
  { id: "frn", label: "FRN", change: -430, percent: -3.1 },
  { id: "cbk", label: "CBK", change: 2180, percent: 4.2 },
  { id: "gge", label: "GGE", change: -1615, percent: -9.4 },
  { id: "way", label: "WAY", change: 1035, percent: 2.6 },
  { id: "fld", label: "FLD", change: 0, percent: 0 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function GainLossDemo() {
  const [sort, setSort] = React.useState<GainLossSort>("best");
  const [basis, setBasis] = React.useState<"amount" | "percent">("amount");

  const net = HOLDINGS.reduce((sum, holding) => sum + holding.change, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GainLoss
        label="Fernworks Capital · positions today"
        holdings={HOLDINGS}
        sort={sort}
        onSortChange={setSort}
        basis={basis}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          aria-pressed={basis === "percent"}
          onClick={() =>
            setBasis((current) => (current === "amount" ? "percent" : "amount"))
          }
        >
          {basis === "amount" ? "Measure percent" : "Measure money"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Sort <span className="text-signal">{sort}</span> · basis {basis} · net{" "}
        <span className="tabular-nums">
          {net >= 0 ? "+" : "-"}
          {money.format(Math.abs(net))}
        </span>{" "}
        · <span className="tabular-nums">{HOLDINGS.length}</span> holdings
      </p>
    </div>
  );
}
