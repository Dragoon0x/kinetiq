"use client";

import * as React from "react";

import { HoldingsRing, type RingAsset } from "@/registry/ui/holdings-ring";

const CORE: RingAsset[] = [
  { id: "bsn", label: "Basin BSN", value: 18400 },
  { id: "frn", label: "Fernwork FRN", value: 12900 },
  { id: "cbk", label: "Coldbrook CBK", value: 8650 },
  { id: "gge", label: "Gauge GGE", value: 5400 },
];

const EXTRA: RingAsset = { id: "way", label: "Waylight WAY", value: 3100 };

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function HoldingsRingDemo() {
  const [withExtra, setWithExtra] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);

  const assets = withExtra ? [...CORE, EXTRA] : CORE;
  const total = assets.reduce((sum, asset) => sum + asset.value, 0);
  const active = assets.find((asset) => asset.id === picked);
  const share = active ? ((active.value / total) * 100).toFixed(1) : null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <HoldingsRing
        label="Waylight Pay · portfolio mix"
        assets={assets}
        value={picked}
        onValueChange={setPicked}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setWithExtra((current) => !current)}
        >
          {withExtra ? "Remove Waylight WAY" : "Add Waylight WAY"}
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={picked === null}
          onClick={() => setPicked(null)}
        >
          Clear selection
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Mix {assets.length} assets ·{" "}
        {active ? (
          <span className="text-signal tabular-nums">
            {active.label} {share}%
          </span>
        ) : (
          <span className="text-signal tabular-nums">
            Total {total.toLocaleString("en-US")}
          </span>
        )}
      </p>
    </div>
  );
}
