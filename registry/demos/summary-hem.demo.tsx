"use client";

import * as React from "react";

import { SummaryHem } from "@/registry/ui/summary-hem";

const CART = [
  {
    id: "cb-1",
    name: "House blend, whole bean",
    detail: "2 × 340g",
    value: "24.00",
  },
  {
    id: "cb-2",
    name: "Kettle point single origin",
    detail: "1 × 250g",
    value: "13.50",
  },
  {
    id: "cb-3",
    name: "Cold brew concentrate",
    detail: "3 × 1L",
    value: "27.00",
  },
  {
    id: "cb-4",
    name: "Paper filters, size 02",
    detail: "1 × 100",
    value: "6.00",
  },
  {
    id: "cb-5",
    name: "Decaf, water process",
    detail: "1 × 340g",
    value: "12.00",
  },
  { id: "cb-6", name: "Travel tin", detail: "1", value: "9.00" },
  { id: "cb-7", name: "Bag credit returned", detail: "5 bags", value: "-2.50" },
];

const LINES = [
  { label: "Items (14)", value: "89.00" },
  { label: "Delivery, north basin", value: "4.00" },
  { label: "Bag credit", value: "-2.50" },
];

export function SummaryHemDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-border bg-card">
        <div ref={frame} className="h-[300px] overflow-y-auto p-3 pb-24">
          <h2 className="mb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook cart
          </h2>
          <ul className="flex flex-col">
            {CART.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {item.name}
                  </p>
                  <p className="truncate text-xs text-ink-3">{item.detail}</p>
                </div>
                <span className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <SummaryHem
          container={frame}
          lines={LINES}
          total="90.50"
          cta={{ label: "Checkout", onPress: () => setPlaced(true) }}
          heading="Coldbrook order"
          onCondensedChange={setCondensed}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Hem{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {condensed ? "condensed" : "expanded"}
        </span>
        {placed ? " · checkout sent" : null}
      </p>
    </div>
  );
}
