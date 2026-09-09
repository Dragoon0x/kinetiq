"use client";

import * as React from "react";

import { LineItem } from "@/registry/ui/line-item";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type BasketLine = {
  id: string;
  name: string;
  note?: string;
  unitPrice: number;
  quantity: number;
};

/** Coldbrook Coffee, rung up on Waylight Pay: 27.40 across three lines. */
const BASKET: BasketLine[] = [
  {
    id: "flat-white",
    name: "Flat white",
    note: "Oat",
    unitPrice: 4.2,
    quantity: 2,
  },
  { id: "pastry", name: "Almond pastry", unitPrice: 3.8, quantity: 1 },
  {
    id: "beans",
    name: "House beans",
    note: "250 g",
    unitPrice: 15.2,
    quantity: 1,
  },
];

export function LineItemDemo() {
  const [lines, setLines] = React.useState(BASKET);

  const total =
    Math.round(
      lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) *
        100,
    ) / 100;
  const pristine =
    lines.length === BASKET.length &&
    lines.every((line, index) => line.quantity === BASKET[index]?.quantity);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1 px-3 py-1">
        <p className="border-b border-hairline py-2 text-[11px] font-medium text-ink-3">
          Coldbrook Coffee · Waylight Pay
        </p>
        {lines.length === 0 ? (
          <p className="py-3 text-xs text-ink-3">Nothing in the basket.</p>
        ) : (
          <ul>
            {lines.map((line) => (
              <li
                key={line.id}
                className="border-t border-hairline first:border-t-0"
              >
                <LineItem
                  name={line.name}
                  note={line.note}
                  unitPrice={line.unitPrice}
                  quantity={line.quantity}
                  onQuantityChange={(quantity) =>
                    setLines((current) =>
                      current.map((entry) =>
                        entry.id === line.id ? { ...entry, quantity } : entry,
                      ),
                    )
                  }
                  onRemove={() =>
                    setLines((current) =>
                      current.filter((entry) => entry.id !== line.id),
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setLines(BASKET)}
        disabled={pristine}
        className="flex h-8 w-fit items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-45"
      >
        Reset basket
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {lines.length} {lines.length === 1 ? "line" : "lines"} ·{" "}
          {currency.format(total)}
        </span>
      </p>
    </div>
  );
}
