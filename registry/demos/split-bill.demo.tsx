"use client";

import * as React from "react";

import { SplitBill, type SplitPerson } from "@/registry/ui/split-bill";

const PEOPLE: SplitPerson[] = [
  { id: "mara", name: "Mara Vance", tint: "var(--accent-bright)" },
  { id: "iyad", name: "Iyad Sorel", tint: "var(--success)" },
  { id: "tomas", name: "Tomas Renn", tint: "var(--warn)" },
  { id: "priya", name: "Priya Okonkwo", tint: "var(--signal)" },
];

const TOTAL = 148.4;

const money = (value: number) => `$${value.toFixed(2)}`;

export function SplitBillDemo() {
  const [shares, setShares] = React.useState([0.4, 0.25, 0.2, 0.15]);

  const cents = Math.round(TOTAL * 100);
  const amounts = shares.map((share) => Math.round(share * cents));
  const drift = cents - amounts.reduce((a, b) => a + b, 0);
  const lead = amounts.reduce(
    (best, amount, index) => (amount > (amounts[best] ?? 0) ? index : best),
    0,
  );
  const leadAmount = ((amounts[lead] ?? 0) + drift) / 100;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SplitBill
        label="Split the bill"
        caption="Coldbrook · Friday"
        total={TOTAL}
        people={PEOPLE}
        value={shares}
        onValueChange={setShares}
        format={money}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{PEOPLE[lead]?.name}</span> leads ·{" "}
        <span className="text-signal">{money(leadAmount)}</span> of{" "}
        <span className="text-signal">{money(TOTAL)}</span> · remainder{" "}
        <span className="text-signal">{money(0)}</span>
      </p>
    </div>
  );
}
