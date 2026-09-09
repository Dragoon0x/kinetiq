"use client";

import * as React from "react";

import { TenderSwitch, type TenderMethod } from "@/registry/ui/tender-switch";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const TOTAL = 48.2;

export function TenderSwitchDemo() {
  const [method, setMethod] = React.useState<TenderMethod>("card");
  const [card, setCard] = React.useState(TOTAL / 2);
  const cash = Math.round((TOTAL - card) * 100) / 100;

  const line =
    method === "split"
      ? `Split · card ${currency.format(card)} · cash ${currency.format(cash)}`
      : `${method === "card" ? "Card" : "Cash"} · ${currency.format(TOTAL)}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TenderSwitch
        label="Waylight Pay · Sale"
        total={TOTAL}
        value={method}
        onValueChange={setMethod}
        cardAmount={card}
        onCardAmountChange={setCard}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{line}</span>
      </p>
    </div>
  );
}
