"use client";

import * as React from "react";

import {
  OrderTicket,
  type OrderSide,
  type SubmittedOrder,
} from "@/registry/ui/order-ticket";

const PRICE = 24.18;
const BUYING_POWER = 4820;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function OrderTicketDemo() {
  const [side, setSide] = React.useState<OrderSide>("buy");
  const [percent, setPercent] = React.useState(50);
  const [sentOrder, setSentOrder] = React.useState<SubmittedOrder | null>(null);

  const amount = (BUYING_POWER * percent) / 100;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <OrderTicket
        symbol="BSN/USD"
        price={PRICE}
        buyingPower={BUYING_POWER}
        side={side}
        onSideChange={setSide}
        sizePercent={percent}
        onSizePercentChange={setPercent}
        unitLabel="BSN"
        onSubmit={setSentOrder}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={!sentOrder && percent === 50 && side === "buy"}
          onClick={() => {
            setSentOrder(null);
            setPercent(50);
            setSide("buy");
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {side} <span className="tabular-nums">{percent}%</span> ·{" "}
        <span className="tabular-nums">{(amount / PRICE).toFixed(2)}</span> BSN
        · Est{" "}
        <span className="text-signal tabular-nums">{money.format(amount)}</span>{" "}
        · {sentOrder ? "Sent" : "Ready"}
      </p>
    </div>
  );
}
