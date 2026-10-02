"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SettleButton, type SettleState } from "@/registry/ui/settle-button";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  stamp: {
    kind: "range",
    label: "Stamp",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  currency: {
    kind: "choice",
    label: "Currency",
    default: "USD",
    options: ["USD", "EUR", "GBP", "JPY"],
    names: { USD: "Dollar", EUR: "Euro", GBP: "Pound", JPY: "Yen" },
  },
});

type Currency = "USD" | "EUR" | "GBP" | "JPY";

const INVOICES: {
  id: string;
  payee: string;
  due: string;
  ref: string;
  amounts: Record<Currency, number>;
}[] = [
  {
    id: "0419",
    payee: "Basinworks supply",
    due: "Oct 9",
    ref: "wp-4f2118",
    amounts: { USD: 1284.5, EUR: 1184.2, GBP: 1012.75, JPY: 189400 },
  },
  {
    id: "0420",
    payee: "Gaugeworks freight",
    due: "Oct 14",
    ref: "wp-7c0453",
    amounts: { USD: 316.08, EUR: 291.4, GBP: 249.9, JPY: 46800 },
  },
  {
    id: "0421",
    payee: "Fieldline studio",
    due: "Oct 21",
    ref: "wp-19e8d6",
    amounts: { USD: 2045, EUR: 1886.6, GBP: 1612.3, JPY: 301500 },
  },
];

/** How long Waylight Pay takes to clear with Coldbrook Bank, in ms. */
const CLEARING = 1600;

/**
 * Waylight Pay settling supplier invoices from a Coldbrook Bank checking
 * account; once one is paid, the next invoice rolls in.
 */
export function SettleButtonDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<SettleState>("idle");
  const [declineNext, setDeclineNext] = React.useState(false);

  const invoice = INVOICES[index % INVOICES.length] ?? INVOICES[0];
  const currency: Currency = values.currency ?? "USD";

  const onPay = () => {
    const decline = declineNext;
    setDeclineNext(false);
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(
        () => (decline ? reject(new Error("Card declined")) : resolve()),
        CLEARING,
      );
    });
  };

  if (!invoice) return null;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card py-2 pr-2 pl-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">{invoice.payee}</p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            Invoice {invoice.id} · due {invoice.due}
          </p>
        </div>
        <SettleButton
          amount={invoice.amounts[currency]}
          successHold={2200}
          onPay={onPay}
          onStateChange={(state) => {
            if (state === "idle" && phase === "success") {
              setIndex((i) => i + 1);
            }
            setPhase(state);
          }}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <>
                <span className="text-signal">settling</span> · coldbrook ··42
              </>
            ) : phase === "success" ? (
              <>
                <span className="text-signal">paid</span> · ref {invoice.ref}
              </>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">declined</span> · not charged
              </>
            ) : (
              <>
                <span className="text-signal">due {invoice.due}</span> ·
                coldbrook ··42
              </>
            )}
          </p>
          <button
            type="button"
            aria-pressed={declineNext}
            onClick={() => setDeclineNext((d) => !d)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              declineNext
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Decline next
          </button>
        </div>
      ) : null}
    </div>
  );
}
