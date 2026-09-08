"use client";

import * as React from "react";

import { AccountDeck, type DeckAccount } from "@/registry/ui/account-deck";

const ACCOUNTS: DeckAccount[] = [
  {
    id: "everyday",
    name: "Everyday",
    kind: "Current",
    tail: "•• 4182",
    balance: 8412.6,
  },
  {
    id: "rainy",
    name: "Rainy Day",
    kind: "Savings",
    tail: "•• 9037",
    balance: 12940,
  },
  {
    id: "ops",
    name: "Fieldline Ops",
    kind: "Business",
    tail: "•• 2251",
    balance: 3208.45,
  },
  {
    id: "travel",
    name: "Travel Pot",
    kind: "Pot",
    tail: "•• 6614",
    balance: 640,
  },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AccountDeckDemo() {
  const [id, setId] = React.useState("everyday");
  const chosen = ACCOUNTS.find((account) => account.id === id) ?? ACCOUNTS[0];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AccountDeck
        label="Waylight Pay"
        accounts={ACCOUNTS}
        value={id}
        onValueChange={setId}
        balanceLabel="Available"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Account <span className="text-signal">{chosen?.name}</span> ·{" "}
        <span className="tabular-nums">
          {money.format(chosen?.balance ?? 0)}
        </span>
      </p>
    </div>
  );
}
