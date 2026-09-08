"use client";

import * as React from "react";

import { CategoryBars, type SpendCategory } from "@/registry/ui/category-bars";

/** Fernworks Money, October — invented merchants, fixed figures. */
const BASE: SpendCategory[] = [
  {
    id: "groceries",
    label: "Groceries",
    amount: 0,
    merchants: [
      { id: "basin-market", name: "Basin Market", amount: 318 },
      { id: "fernwork-greens", name: "Fernwork Greens", amount: 186 },
      { id: "coldbrook-diner", name: "Coldbrook Diner", amount: 142 },
    ],
  },
  {
    id: "home",
    label: "Home",
    amount: 0,
    merchants: [
      { id: "gauge-hardware", name: "Gauge Hardware", amount: 264 },
      { id: "basinworks-power", name: "Basinworks Power", amount: 148 },
    ],
  },
  {
    id: "transit",
    label: "Transit",
    amount: 0,
    merchants: [
      { id: "waylight-transit", name: "Waylight Transit", amount: 192 },
    ],
  },
  {
    id: "health",
    label: "Health",
    amount: 0,
    merchants: [
      { id: "fernworks-clinic", name: "Fernworks Clinic", amount: 140 },
      { id: "basin-pharmacy", name: "Basin Pharmacy", amount: 74 },
    ],
  },
  {
    id: "gifts",
    label: "Gifts",
    amount: 0,
    merchants: [
      { id: "gauge-paper", name: "Gauge Paper", amount: 88 },
      { id: "coldbrook-press", name: "Coldbrook Press", amount: 43 },
    ],
  },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** A small LCG: one seed, one month, identical on the server and the client. */
function reseed(seed: number): SpendCategory[] {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return BASE.map((category) => {
    const merchants = (category.merchants ?? []).map((merchant) => ({
      ...merchant,
      amount: Math.round(merchant.amount * (0.65 + next() * 0.8)),
    }));
    return {
      ...category,
      merchants,
      amount: merchants.reduce((sum, merchant) => sum + merchant.amount, 0),
    };
  });
}

export function CategoryBarsDemo() {
  const [seed, setSeed] = React.useState(7);
  const [open, setOpen] = React.useState<string | null>(null);

  const categories = React.useMemo(() => reseed(seed), [seed]);
  const total = categories.reduce((sum, row) => sum + row.amount, 0);
  const current = categories.find((row) => row.id === open);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CategoryBars
        label="Fernworks · October"
        categories={categories}
        expanded={open}
        onExpandedChange={setOpen}
      />

      <button
        type="button"
        onClick={() => setSeed((value) => value + 1)}
        className="h-8 w-fit rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Recalculate
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {current
          ? `${current.label} open · ${money.format(current.amount)} · ${Math.round(
              (current.amount / total) * 100,
            )}% of total`
          : `${categories.length} categories · ${money.format(total)} total`}
      </p>
    </div>
  );
}
