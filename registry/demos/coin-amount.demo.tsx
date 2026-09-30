"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CoinAmount, type CoinCurrency } from "@/registry/ui/coin-amount";

export const tweaks = defineTweaks({
  currency: {
    kind: "choice",
    label: "Currency",
    default: "usd",
    options: ["usd", "eur", "inr", "gbp"],
    names: { usd: "Dollar", eur: "Euro", inr: "Rupee", gbp: "Pound" },
  },
  convert: { kind: "toggle", label: "Convert", default: true },
  stack: {
    kind: "range",
    label: "Stack",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const AVAILABLE = 4812.3;

const MONEY: Record<CoinCurrency, { locale: string; code: string }> = {
  usd: { locale: "en-US", code: "USD" },
  eur: { locale: "en-IE", code: "EUR" },
  inr: { locale: "en-IN", code: "INR" },
  gbp: { locale: "en-GB", code: "GBP" },
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** What the counter holds for an amount: bundles, notes and coins. */
function counted(amount: number) {
  const [whole = "0", part = "00"] = amount.toFixed(2).split(".");
  const digits = [...whole].reverse().map(Number);
  let bundles = 0;
  let notes = 0;
  let coins = Number(part[0] ?? 0) + Number(part[1] ?? 0);
  digits.forEach((d, e) => {
    if (e >= 3) bundles += d;
    else if (e >= 1) notes += d;
    else coins += d;
  });
  return [
    bundles ? plural(bundles, "bundle", "bundles") : "",
    notes ? plural(notes, "note", "notes") : "",
    coins ? plural(coins, "coin", "coins") : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A transfer from a Coldbrook Bank account: the amount to send, counted out
 * on the counter as it is typed, and what the recipient gets.
 */
export function CoinAmountDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [amount, setAmount] = React.useState<number | null>(1284.35);
  const currency = values.currency ?? tweaks.currency.default;
  const money = MONEY[currency] ?? MONEY.usd;
  const format = (n: number) =>
    new Intl.NumberFormat(money.locale, {
      style: "currency",
      currency: money.code,
    }).format(n);

  const status =
    amount === null || amount === 0
      ? { lead: "nothing to send yet", rest: "type an amount" }
      : amount > AVAILABLE
        ? {
            lead: "more than the balance",
            rest: `available ${format(AVAILABLE)}`,
          }
        : { lead: `sending ${format(amount)}`, rest: counted(amount) };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <CoinAmount
        label="Amount to send"
        hint={`Available: ${format(AVAILABLE)}`}
        max={AVAILABLE}
        value={amount}
        onValueChange={setAmount}
        name="amount"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{status.lead}</span> · {status.rest}
        </p>
      ) : null}
    </div>
  );
}
