"use client";

import * as React from "react";

import { PoolShare, type PoolReserve } from "@/registry/ui/pool-share";

const SEED_POSITION = 29900;
const SEED_POOL = 1240000;
const SEED_RESERVES: [number, number] = [41800, 519072];

const percents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function PoolShareDemo() {
  const [position, setPosition] = React.useState(SEED_POSITION);
  const [pool, setPool] = React.useState(SEED_POOL);

  const scale = pool / SEED_POOL;
  const reserves: [PoolReserve, PoolReserve] = [
    { symbol: "BSN", amount: SEED_RESERVES[0] * scale },
    { symbol: "FRN", amount: SEED_RESERVES[1] * scale },
  ];
  const seeded = position === SEED_POSITION;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PoolShare
        label="Basinworks Exchange"
        poolName="BSN / FRN"
        contributed={position}
        poolTotal={pool}
        fees={184.6}
        reserves={reserves}
        onAdd={(amount) => {
          setPosition((value) => value + amount);
          setPool((value) => value + amount);
        }}
      />

      <button
        type="button"
        disabled={seeded}
        onClick={() => {
          setPosition(SEED_POSITION);
          setPool(SEED_POOL);
        }}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset position
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Share{" "}
        <span className="text-signal tabular-nums">
          {percents.format((position / pool) * 100)}%
        </span>{" "}
        — Position{" "}
        <span className="text-signal tabular-nums">
          {currency.format(position)}
        </span>
      </p>
    </div>
  );
}
