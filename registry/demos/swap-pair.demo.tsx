"use client";

import * as React from "react";

import { SwapPair, type SwapAsset } from "@/registry/ui/swap-pair";

const PAIR: [SwapAsset, SwapAsset] = [
  { symbol: "BSN", name: "Basin", balance: 1280.4 },
  { symbol: "FRN", name: "Fernwork", balance: 96.2 },
];

const RATE = 12.418;

const amounts = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SwapPairDemo() {
  const [amount, setAmount] = React.useState(250);
  const [inverted, setInverted] = React.useState(false);

  const pay = PAIR[inverted ? 1 : 0];
  const receive = PAIR[inverted ? 0 : 1];
  const out = amount * (inverted ? 1 / RATE : RATE);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SwapPair
        label="Basinworks Exchange · swap"
        assets={PAIR}
        rate={RATE}
        amount={amount}
        onAmountChange={setAmount}
        inverted={inverted}
        onInvertedChange={setInverted}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Pay{" "}
        <span className="text-signal tabular-nums">
          {amounts.format(amount)} {pay.symbol}
        </span>{" "}
        — Receive{" "}
        <span className="text-signal tabular-nums">
          {amounts.format(out)} {receive.symbol}
        </span>
      </p>
    </div>
  );
}
