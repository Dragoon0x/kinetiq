"use client";

import * as React from "react";

import { AprCompare, type AprOffer } from "@/registry/ui/apr-compare";

const AMOUNTS = [5000, 10000, 20000];
/** Seeded rate pairs, so a fresh quote is a real roll every time. */
const QUOTES: [number, number][] = [
  [8.4, 9.9],
  [7.9, 10.4],
  [9.2, 8.8],
];
const TERMS: [number, number] = [60, 48];

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monthly = (principal: number, apr: number, months: number) => {
  const r = apr / 1200;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
};

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-cobalt-bright/50 aria-pressed:bg-cobalt-wash";

export function AprCompareDemo() {
  const [amount, setAmount] = React.useState(AMOUNTS[1]!);
  const [quote, setQuote] = React.useState(0);
  const [picked, setPicked] = React.useState<string | undefined>(undefined);

  const rates = QUOTES[quote % QUOTES.length]!;
  const offers: [AprOffer, AprOffer] = [
    {
      id: "coldbrook",
      lender: "Coldbrook Bank",
      apr: rates[0],
      term: TERMS[0],
    },
    { id: "waylight", lender: "Waylight Pay", apr: rates[1], term: TERMS[1] },
  ];

  const totals = offers.map(
    (offer) => monthly(amount, offer.apr, offer.term) * offer.term,
  );
  const pickedIndex = offers.findIndex((offer) => offer.id === picked);
  const chosen = pickedIndex >= 0 ? offers[pickedIndex] : null;
  const difference =
    pickedIndex >= 0 ? totals[1 - pickedIndex]! - totals[pickedIndex]! : 0;

  const line = chosen
    ? `${chosen.lender} ${chosen.apr.toFixed(1)}% · ${MONEY.format(monthly(amount, chosen.apr, chosen.term))} / mo | ${
        difference >= 0
          ? `saves ${MONEY.format(difference)}`
          : `costs ${MONEY.format(-difference)} more`
      }`
    : "nothing picked";

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <AprCompare
        label="Fieldline Loans"
        offers={offers}
        amount={amount}
        value={picked}
        onValueChange={setPicked}
      />

      <div className="flex flex-wrap gap-2">
        {AMOUNTS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === amount}
            className={BUTTON}
            onClick={() => setAmount(option)}
          >
            {MONEY.format(option)}
          </button>
        ))}
        <button
          type="button"
          className={BUTTON}
          onClick={() => setQuote((index) => index + 1)}
        >
          New quotes
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Fieldline Loans{" "}
        <span className="text-cobalt-bright tabular-nums">
          {MONEY.format(amount)} | {line}
        </span>
      </p>
    </div>
  );
}
