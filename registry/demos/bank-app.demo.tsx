"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BankApp,
  defaultBankAccount,
  defaultBankContacts,
  defaultBankTransactions,
  type BankPayment,
  type BankTransaction,
} from "@/registry/ui/bank-app";

export const tweaks = defineTweaks({
  balance: {
    kind: "choice",
    label: "Hide style",
    default: "roll",
    options: ["roll", "frost", "redact"],
    names: { roll: "Roll", frost: "Frost", redact: "Redact" },
  },
  sheet: {
    kind: "choice",
    label: "Sheet",
    default: "bottom",
    options: ["bottom", "full", "float"],
    names: { bottom: "Bottom", full: "Full", float: "Float" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/** How long the bank takes to answer a payment, ms. */
const CLEARING = 900;

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const balanceOf = (list: BankTransaction[]) =>
  Math.round(
    list.reduce(
      (sum, t) => (t.pending && t.amount > 0 ? sum : sum + t.amount),
      defaultBankAccount.opening,
    ) * 100,
  ) / 100;

type Phase =
  | { kind: "idle" }
  | { kind: "pending"; payment: BankPayment }
  | { kind: "landed"; payment: BankPayment }
  | { kind: "declined"; payment: BankPayment };

const nameOf = (id?: string) =>
  defaultBankContacts.find((c) => c.id === id)?.name.toLowerCase() ?? "savings";

/**
 * Ada's Everyday account at Coldbrook Bank on the last morning of
 * September: hide the balance, filter the week, open a payment, or send
 * Mira the money for the gig tickets.
 */
export function BankAppDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState(defaultBankTransactions);
  const [hidden, setHidden] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [declineNext, setDeclineNext] = React.useState(false);
  const decline = React.useRef(false);
  React.useEffect(() => {
    decline.current = declineNext;
  }, [declineNext]);

  const onSend = (payment: BankPayment) => {
    const fail = decline.current;
    if (fail) setDeclineNext(false);
    setPhase({ kind: "pending", payment });
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(() => {
        if (fail) {
          setPhase({ kind: "declined", payment });
          reject(new Error("Declined by Coldbrook Bank"));
        } else {
          setPhase({ kind: "landed", payment });
          resolve();
        }
      }, CLEARING);
    });
  };

  const app = (
    <BankApp
      transactions={list}
      onTransactionsChange={setList}
      hidden={hidden}
      onHiddenChange={setHidden}
      onSend={onSend}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{app}</div>;

  const balance = usd.format(balanceOf(list));
  const verb = (p: BankPayment) =>
    p.mode === "send" ? "sent" : p.mode === "request" ? "asked" : "added";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {app}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {phase.kind === "pending" ? (
            <>
              <span className="text-signal">
                {phase.payment.mode === "add" ? "adding" : "sending"}{" "}
                {usd.format(phase.payment.amount)}
              </span>{" "}
              · {phase.payment.mode === "add" ? "from" : "to"}{" "}
              {nameOf(phase.payment.contact)}
            </>
          ) : phase.kind === "landed" ? (
            <>
              <span className="text-signal">
                {verb(phase.payment)} {usd.format(phase.payment.amount)}
              </span>{" "}
              · balance {hidden ? "hidden" : balance}
            </>
          ) : phase.kind === "declined" ? (
            <>
              <span className="text-signal">declined</span> · nothing left the
              account
            </>
          ) : hidden ? (
            <>
              <span className="text-signal">balance hidden</span> · tap the eye
              to show it
            </>
          ) : (
            <>
              <span className="text-signal">everyday ··4821</span> · balance{" "}
              {balance} · {list.length} transactions
            </>
          )}
        </p>
        <button
          type="button"
          aria-pressed={declineNext}
          onClick={() => setDeclineNext((v) => !v)}
          className={cn(
            "inline-flex h-7 shrink-0 items-center rounded-2 border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            declineNext
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-hairline text-ink-3 hover:text-foreground",
          )}
        >
          Decline next
        </button>
      </div>
    </div>
  );
}
