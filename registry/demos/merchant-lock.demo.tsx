"use client";

import * as React from "react";

import {
  MerchantLock,
  type MerchantCategory,
} from "@/registry/ui/merchant-lock";

const CATEGORIES: MerchantCategory[] = [
  { id: "groceries", label: "Groceries", amount: 340, glyph: "cart" },
  { id: "fuel", label: "Fuel", amount: 120, glyph: "fuel" },
  { id: "streaming", label: "Streaming", amount: 36, glyph: "stream" },
  { id: "travel", label: "Travel", amount: 480, glyph: "travel" },
  { id: "dining", label: "Dining", amount: 210, glyph: "dining" },
  { id: "cash", label: "Cash withdrawal", amount: 150, glyph: "cash" },
];

const ALLOWED = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function MerchantLockDemo() {
  const [locked, setLocked] = React.useState<string[]>(["travel", "cash"]);

  const total = CATEGORIES.reduce(
    (sum, entry) => (locked.includes(entry.id) ? sum : sum + entry.amount),
    0,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MerchantLock
        label="Where this card can spend"
        categories={CATEGORIES}
        locked={locked}
        onLockedChange={setLocked}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Allowed{" "}
        <span className="text-cobalt-bright">{ALLOWED.format(total)}</span> a
        month · {locked.length} of {CATEGORIES.length} categories locked
      </p>
    </div>
  );
}
