"use client";

import * as React from "react";

import { CreditNote } from "@/registry/ui/credit-note";

const SUBTOTAL = 64;
const CREDITS = [86, 40];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border px-3 font-mono text-xs tabular-nums outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CreditNoteDemo() {
  const [credit, setCredit] = React.useState(CREDITS[0] ?? 86);
  const [applied, setApplied] = React.useState(0);

  const carries = credit - applied;
  const due = SUBTOTAL - applied;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      {/* Keyed by the credit so a scenario change starts a fresh note rather
          than inheriting a chip mid-flight. */}
      <CreditNote
        key={credit}
        credit={credit}
        invoiceSubtotal={SUBTOTAL}
        applied={applied}
        onAppliedChange={setApplied}
        creditReference="CN-0418 · Waylight Pay"
        invoiceReference="INV-2052 · Oct"
      />

      <div className="flex flex-wrap gap-2">
        {CREDITS.map((preset) => {
          const active = preset === credit;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setCredit(preset);
                setApplied(0);
              }}
              className={`${BUTTON} ${
                active
                  ? "border-hairline-strong bg-cobalt-wash text-foreground"
                  : "border-input bg-surface-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Credit {money.format(preset)}
            </button>
          );
        })}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Applied{" "}
        <span className="text-signal tabular-nums">
          {money.format(applied)}
        </span>
        {` · invoice due ${money.format(due)}`}
        {applied > 0 && carries > 0
          ? ` · ${money.format(carries)} carries`
          : ""}
      </p>
    </div>
  );
}
