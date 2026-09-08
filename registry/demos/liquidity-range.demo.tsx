"use client";

import * as React from "react";

import {
  LiquidityRange,
  type LiquidityBin,
} from "@/registry/ui/liquidity-range";

const LOW = 9.5;
const HIGH = 15.5;
const SAMPLES = 48;

/** Two fixed Gaussians summed at fixed prices, rounded so the server and the
 *  browser agree to the last digit. */
const BINS: LiquidityBin[] = Array.from({ length: SAMPLES }, (_, index) => {
  const price = LOW + (index * (HIGH - LOW)) / (SAMPLES - 1);
  const depth =
    118 * Math.exp(-((price - 12.2) ** 2) / (2 * 0.55 ** 2)) +
    64 * Math.exp(-((price - 13.4) ** 2) / (2 * 0.95 ** 2)) +
    9;
  return { price: Number(price.toFixed(4)), depth: Number(depth.toFixed(3)) };
});

const prices = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const buttonClass =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function LiquidityRangeDemo() {
  const [band, setBand] = React.useState<[number, number]>([11.8, 13.1]);
  const [price, setPrice] = React.useState(12.42);

  const inRange = price >= band[0] && price <= band[1];
  const total = BINS.reduce((sum, bin) => sum + bin.depth, 0);
  const covered = BINS.reduce(
    (sum, bin) =>
      bin.price >= band[0] && bin.price <= band[1] ? sum + bin.depth : sum,
    0,
  );

  const nudge = (delta: number) =>
    setPrice((value) =>
      Number(Math.min(HIGH, Math.max(LOW, value + delta)).toFixed(2)),
    );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LiquidityRange
        label="Basinworks Exchange"
        bins={BINS}
        price={price}
        value={band}
        onValueChange={setBand}
        unit="FRN per BSN"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => nudge(-0.28)}
          className={buttonClass}
        >
          Price −
        </button>
        <button
          type="button"
          onClick={() => nudge(0.28)}
          className={buttonClass}
        >
          Price +
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Band{" "}
        <span className="text-signal tabular-nums">
          {prices.format(band[0])} – {prices.format(band[1])}
        </span>{" "}
        · price{" "}
        <span className="text-signal tabular-nums">{prices.format(price)}</span>{" "}
        {inRange ? "in range" : "out of range"} · depth{" "}
        <span className="text-signal tabular-nums">
          {Math.round((covered / total) * 100)}%
        </span>
      </p>
    </div>
  );
}
