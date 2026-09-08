"use client";

import * as React from "react";

import {
  RebalanceBars,
  type RebalanceAsset,
} from "@/registry/ui/rebalance-bars";

const MODEL: RebalanceAsset[] = [
  { id: "bsn", label: "Basin BSN", current: 38, target: 30 },
  { id: "frn", label: "Fernwork FRN", current: 22, target: 30 },
  { id: "cbk", label: "Coldbrook CBK", current: 26, target: 25 },
  { id: "gge", label: "Gauge GGE", current: 14, target: 15 },
];

const TOTAL = 62000;

const TRADES = MODEL.filter((asset) => asset.current !== asset.target).length;
const DRIFT =
  MODEL.reduce(
    (sum, asset) => sum + Math.abs(asset.target - asset.current),
    0,
  ) / 2;

export function RebalanceBarsDemo() {
  const [applied, setApplied] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RebalanceBars
        label="Fieldline Ops · model mix"
        assets={MODEL}
        total={TOTAL}
        applied={applied}
        onAppliedChange={setApplied}
      />

      <button
        type="button"
        disabled={!applied}
        onClick={() => setApplied(false)}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset drift
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {applied ? (
          <>
            On target ·{" "}
            <span className="text-signal tabular-nums">
              {TRADES} trades settled
            </span>
          </>
        ) : (
          <>
            Drift{" "}
            <span className="text-signal tabular-nums">{DRIFT} points</span> ·{" "}
            {TRADES} trades pending
          </>
        )}
      </p>
    </div>
  );
}
