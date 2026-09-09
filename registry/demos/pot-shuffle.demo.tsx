"use client";

import * as React from "react";

import { PotShuffle, type ShufflePot } from "@/registry/ui/pot-shuffle";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Fernworks savings, four pots deep. */
const SEED: ShufflePot[] = [
  { id: "holiday", name: "Holiday", balance: 1240 },
  { id: "rainy", name: "Rainy day", balance: 800 },
  { id: "bike", name: "New bike", balance: 360 },
  { id: "gifts", name: "Gifts", balance: 140 },
];

export function PotShuffleDemo() {
  const [pots, setPots] = React.useState<ShufflePot[]>(SEED);
  const [lastMove, setLastMove] = React.useState<string | null>(null);

  const nameOf = (id: string) => pots.find((pot) => pot.id === id)?.name ?? id;
  const total = pots.reduce((sum, pot) => sum + pot.balance, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PotShuffle
        label="Fernworks savings"
        pots={pots}
        onPotsChange={setPots}
        onMove={(from, to, amount) =>
          setLastMove(
            `moved ${money.format(amount)} · ${nameOf(from)} → ${nameOf(to)}`,
          )
        }
        step={50}
      />

      <button
        type="button"
        onClick={() => {
          setPots(SEED);
          setLastMove(null);
        }}
        className="h-8 w-fit rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reset pots
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lastMove ?? `${pots.length} pots · ${money.format(total)} total`}
      </p>
    </div>
  );
}
