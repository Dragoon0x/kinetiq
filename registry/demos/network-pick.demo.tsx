"use client";

import * as React from "react";

import { NetworkPick, type NetworkChain } from "@/registry/ui/network-pick";

const CHAINS: NetworkChain[] = [
  {
    id: "basin",
    name: "Basin",
    symbol: "BSN",
    tone: "cobalt",
    balance: 12.482,
    fiat: 8412.6,
  },
  {
    id: "fernwork",
    name: "Fernwork",
    symbol: "FRN",
    tone: "signal",
    balance: 940.1204,
    fiat: 2408.45,
  },
  {
    id: "coldbrook",
    name: "Coldbrook",
    symbol: "CBK",
    tone: "warn",
    balance: 3.0917,
    fiat: 19240.08,
  },
  {
    id: "gauge",
    name: "Gauge",
    symbol: "GGE",
    tone: "success",
    balance: 1284.6,
    fiat: 640.2,
  },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const units = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function NetworkPickDemo() {
  const [id, setId] = React.useState("basin");
  const chain = CHAINS.find((entry) => entry.id === id) ?? CHAINS[0];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <NetworkPick
        label="Network"
        chains={CHAINS}
        value={id}
        onValueChange={setId}
        caption="Waylight Pay · Everyday"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Network <span className="text-signal">{chain?.name}</span> ·{" "}
        <span className="tabular-nums">
          {units.format(chain?.balance ?? 0)} {chain?.symbol}
        </span>{" "}
        · <span className="tabular-nums">{money.format(chain?.fiat ?? 0)}</span>
      </p>
    </div>
  );
}
