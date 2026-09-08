"use client";

import * as React from "react";

import { EnvelopeRow, type EnvelopeItem } from "@/registry/ui/envelope-row";

/** Fieldline's October household budget — Repairs deliberately over its line. */
const SEED: EnvelopeItem[] = [
  { id: "groceries", name: "Groceries", allocated: 420, spent: 268 },
  { id: "transit", name: "Transit", allocated: 160, spent: 94 },
  { id: "repairs", name: "Repairs", allocated: 180, spent: 214 },
  { id: "gifts", name: "Gifts", allocated: 120, spent: 38 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function EnvelopeRowDemo() {
  const [envelopes, setEnvelopes] = React.useState<EnvelopeItem[]>(SEED);
  const [lastMove, setLastMove] = React.useState<string | null>(null);

  const nameOf = (id: string) =>
    envelopes.find((item) => item.id === id)?.name ?? id;

  const allocated = envelopes.reduce((sum, item) => sum + item.allocated, 0);
  const left = envelopes.reduce(
    (sum, item) => sum + item.allocated - item.spent,
    0,
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <EnvelopeRow
        label="Fieldline · October"
        envelopes={envelopes}
        onEnvelopesChange={setEnvelopes}
        onTransfer={(from, to, amount) =>
          setLastMove(
            `moved ${money.format(amount)} · ${nameOf(from)} → ${nameOf(to)}`,
          )
        }
        step={25}
      />

      <button
        type="button"
        onClick={() => {
          setEnvelopes(SEED);
          setLastMove(null);
        }}
        className="h-8 w-fit rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Reset month
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lastMove ??
          `${money.format(allocated)} allocated · ${money.format(left)} left`}
      </p>
    </div>
  );
}
