"use client";

import * as React from "react";

import { RouteSplit, type RouteLeg } from "@/registry/ui/route-split";

const AMOUNT = 12000;

const SPLITS: RouteLeg[][] = [
  [
    { id: "basin", venue: "Basin Pool", share: 0.52 },
    { id: "fernwork", venue: "Fernwork Deep", share: 0.31 },
    { id: "coldbrook", venue: "Coldbrook Bridge", share: 0.17 },
  ],
  [
    { id: "basin", venue: "Basin Pool", share: 0.44 },
    { id: "fernwork", venue: "Fernwork Deep", share: 0.24 },
    { id: "coldbrook", venue: "Coldbrook Bridge", share: 0.32 },
  ],
];

const units = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function RouteSplitDemo() {
  const [plan, setPlan] = React.useState(0);
  const [active, setActive] = React.useState<string | null>(null);

  const legs = SPLITS[plan] ?? SPLITS[0]!;
  const leg = legs.find((entry) => entry.id === active);
  const total = legs.reduce((sum, entry) => sum + entry.share, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RouteSplit
        label="Basinworks Exchange"
        legs={legs}
        amount={AMOUNT}
        from="BSN"
        to="FRN"
        onActiveChange={setActive}
      />

      <button
        type="button"
        onClick={() => setPlan((value) => (value === 0 ? 1 : 0))}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Rebalance
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Route{" "}
        {leg ? (
          <span className="text-signal tabular-nums">
            {leg.venue} — {Math.round((leg.share / total) * 100)}% ·{" "}
            {units.format(AMOUNT * (leg.share / total))} BSN
          </span>
        ) : (
          <span className="text-signal tabular-nums">
            all roads — {legs.length} legs · {units.format(AMOUNT)} BSN
          </span>
        )}
      </p>
    </div>
  );
}
