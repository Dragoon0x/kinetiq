"use client";

import * as React from "react";

import { NonceLine, type NonceItem } from "@/registry/ui/nonce-line";

/** Fernworks Supply's payout run — nonce 43 never made it out. */
const RUN: NonceItem[] = [
  {
    nonce: 41,
    hash: "0x4f2a91c0",
    status: "confirmed",
    amount: 300,
    to: "Fernworks Supply",
  },
  {
    nonce: 42,
    hash: "0xb7e3d418",
    status: "confirmed",
    amount: 82.5,
    to: "Waylight Pay",
  },
  {
    nonce: 44,
    hash: "0x0c19bfa2",
    status: "pending",
    amount: 120,
    to: "Coldbrook Bank",
  },
  {
    nonce: 45,
    hash: "0x93de6017",
    status: "pending",
    amount: 46.2,
    to: "Gaugeworks",
  },
  {
    nonce: 46,
    hash: "0x2ab84f55",
    status: "pending",
    amount: 915,
    to: "Basinworks Exchange",
  },
];

const REPLACEMENT: NonceItem = {
  nonce: 43,
  hash: "0x71c40ade",
  status: "pending",
  amount: 64.8,
  to: "Fernworks Supply",
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function NonceLineDemo() {
  const [items, setItems] = React.useState<NonceItem[]>(RUN);
  const [focused, setFocused] = React.useState(44);

  const filled = items.some((item) => item.nonce === 43);
  const active = items.find((item) => item.nonce === focused);
  const state = !active
    ? "gap"
    : active.status === "pending" && !filled && active.nonce > 43
      ? "blocked"
      : active.status;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <NonceLine
        label="Basin outbox"
        items={items}
        value={focused}
        onValueChange={setFocused}
        onFill={() => setItems((current) => [...current, REPLACEMENT])}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={filled}
          onClick={() => setItems((current) => [...current, REPLACEMENT])}
        >
          Fill 43
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!filled}
          onClick={() => setItems(RUN)}
        >
          Reset run
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Nonce {focused} <span className="text-cobalt-bright">{state}</span>
      </p>
    </div>
  );
}
