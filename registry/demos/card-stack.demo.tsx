"use client";

import * as React from "react";

import { CardStack, type StackCard } from "@/registry/ui/card-stack";

const EVERYDAY: StackCard = {
  id: "everyday",
  name: "Waylight Everyday",
  last4: "4417",
  network: "Waylight",
  balance: 2480,
};

const CARDS: StackCard[] = [
  EVERYDAY,
  {
    id: "travel",
    name: "Fernwork Travel",
    last4: "8062",
    network: "Fernwork",
    balance: 910,
  },
  {
    id: "reserve",
    name: "Basin Reserve",
    last4: "2350",
    network: "Basin",
    balance: 14260,
  },
];

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CardStackDemo() {
  const [front, setFront] = React.useState(EVERYDAY.id);
  const card = CARDS.find((entry) => entry.id === front) ?? EVERYDAY;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CardStack
        label="Coldbrook Bank"
        cards={CARDS}
        value={front}
        onValueChange={setFront}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Front <span className="text-cobalt-bright">{card.name}</span> ····{" "}
        {card.last4} · {MONEY.format(card.balance ?? 0)}
      </p>
    </div>
  );
}
