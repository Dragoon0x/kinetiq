"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CalcField } from "@/registry/ui/calc-field";

export const tweaks = defineTweaks({
  precision: {
    kind: "range",
    label: "Precision",
    default: 2,
    min: 0,
    max: 3,
    step: 1,
  },
  currency: {
    kind: "choice",
    label: "Currency",
    default: "USD",
    options: ["USD", "EUR", "GBP", "none"],
    names: { USD: "Dollar", EUR: "Euro", GBP: "Pound", none: "None" },
  },
  expression: { kind: "toggle", label: "Expression", default: true },
  rounding: {
    kind: "choice",
    label: "Rounding",
    default: "half-up",
    options: ["half-up", "half-even", "up", "down"],
    names: {
      "half-up": "Half up",
      "half-even": "Half even",
      up: "Up",
      down: "Down",
    },
  },
});

/** The cabin, for the whole group. A bare percentage is a share of it. */
const TOTAL = 1240;

const inWords = (amount: number, currency: string, precision: number) => {
  const plain = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? "−" : "";
  if (currency === "none") return `${sign}${plain}`;
  const symbol =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency;
  return `${sign}${symbol}${plain}`;
};

/**
 * Waylight Pay, paying back a share of the Coldbrook cabin: 1,240 for three
 * nights, split three ways. The amount opens on the sum 1240/3, so the answer
 * is already riding along; 15% works too, as a share of the 1,240.
 */
export function CalcFieldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [amount, setAmount] = React.useState<number | null>(null);
  const currency = values.currency ?? tweaks.currency.default;
  const precision = values.precision ?? tweaks.precision.default;

  const field = (
    <CalcField
      label="Amount to pay back"
      defaultText="1240/3"
      percentOf={TOTAL}
      value={amount}
      onValueChange={setAmount}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-sm">{field}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Coldbrook cabin
            </p>
            <p className="text-xs text-ink-3">Waylight Pay · 3 nights</p>
          </div>
          <span className="shrink-0 font-mono text-xs text-ink-2 tabular-nums">
            {inWords(TOTAL, currency, 0)} total
          </span>
        </div>
        {field}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {amount === null ? (
          <>
            <span className="text-signal">not set</span> · enter or leave the
            field to set it
          </>
        ) : (
          <>
            <span className="text-signal">paying back</span> ·{" "}
            {inWords(amount, currency, precision)}
          </>
        )}
      </p>
    </div>
  );
}
