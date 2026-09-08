"use client";

import * as React from "react";

import { BalanceRoll } from "@/registry/ui/balance-roll";

/** Cents, so a run of movements cannot drift the way floating money does. */
const START = 841260;
const CREDITS = [24000, 248000, 6240];
const DEBITS = [6240, 14800, 4120];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function BalanceRollDemo() {
  const [cents, setCents] = React.useState(START);
  const [creditAt, setCreditAt] = React.useState(0);
  const [debitAt, setDebitAt] = React.useState(0);
  const [masked, setMasked] = React.useState(false);
  const [last, setLast] = React.useState(0);

  const credit = () => {
    setCents((current) => current + (CREDITS[creditAt % CREDITS.length] ?? 0));
    setCreditAt((index) => index + 1);
  };

  const debit = () => {
    setCents((current) =>
      Math.max(0, current - (DEBITS[debitAt % DEBITS.length] ?? 0)),
    );
    setDebitAt((index) => index + 1);
  };

  const reset = () => {
    setCents(START);
    setCreditAt(0);
    setDebitAt(0);
    setLast(0);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <BalanceRoll
        label="Available balance"
        value={cents / 100}
        masked={masked}
        onMaskedChange={setMasked}
        onValueSettle={(_value, delta) => setLast(delta)}
        caption="Waylight Pay · Everyday"
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={credit}>
          Credit
        </button>
        <button type="button" className={BUTTON} onClick={debit}>
          Debit
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={cents === START}
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Balance{" "}
        <span className="text-signal tabular-nums">
          {masked ? "hidden" : money.format(cents / 100)}
        </span>
        {last === 0
          ? null
          : ` · last ${last > 0 ? "+" : "-"}${money.format(Math.abs(last))}`}
      </p>
    </div>
  );
}
