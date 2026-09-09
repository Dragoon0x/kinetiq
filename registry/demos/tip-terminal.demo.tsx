"use client";

import * as React from "react";

import { TipTerminal, type TipChoice } from "@/registry/ui/tip-terminal";

const SUBTOTAL = 14.6;
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const START: { choice: TipChoice; tip: number } = {
  choice: { kind: "preset", percent: 18 },
  tip: 2.63,
};

const describe = (choice: TipChoice, tip: number): string => {
  if (choice.kind === "none") return "no tip";
  if (choice.kind === "custom") return `tip ${MONEY.format(tip)} (custom)`;
  return `tip ${MONEY.format(tip)} (${choice.percent}%)`;
};

export function TipTerminalDemo() {
  const [order, setOrder] = React.useState(1);
  const [state, setState] = React.useState(START);
  const [paid, setPaid] = React.useState<number | null>(null);

  const newOrder = () => {
    setOrder((previous) => previous + 1);
    setState(START);
    setPaid(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {/* Keyed by order: a new order is a new terminal, not a paid one reset. */}
      <TipTerminal
        key={order}
        label="Coldbrook Coffee"
        subtotal={SUBTOTAL}
        defaultValue={START.choice}
        onValueChange={(choice, tip) => setState({ choice, tip })}
        onConfirm={(total) => setPaid(total)}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={newOrder}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          New order
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {paid === null ? (
          <>
            Coldbrook Coffee ·{" "}
            <span className="text-cobalt-bright tabular-nums">
              {describe(state.choice, state.tip)} · total{" "}
              {MONEY.format(SUBTOTAL + state.tip)}
            </span>
          </>
        ) : (
          <span className="text-success tabular-nums">
            Paid {MONEY.format(paid)} · tip {MONEY.format(state.tip)}
          </span>
        )}
      </p>
    </div>
  );
}
