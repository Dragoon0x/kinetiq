"use client";

import * as React from "react";

import { SpendLimit } from "@/registry/ui/spend-limit";

const MONEY = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = (value: number) => MONEY.format(value);

const BUTTON =
  "flex h-8 flex-1 items-center justify-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

export function SpendLimitDemo() {
  const [limit, setLimit] = React.useState(1200);
  const [spend, setSpend] = React.useState(860);

  const over = spend - limit;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SpendLimit
        label="Coldbrook card ceiling"
        value={limit}
        onValueChange={setLimit}
        spend={spend}
        format={money}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setSpend((previous) => Math.min(2000, previous + 240))}
        >
          Spend 240
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            setSpend(860);
            setLimit(1200);
          }}
        >
          Reset month
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Limit <span className="tabular-nums">{money(limit)}</span> ·{" "}
        {over > 0 ? (
          <span className="text-danger">
            over by <span className="tabular-nums">{money(over)}</span>
          </span>
        ) : (
          <span className="text-cobalt-bright">
            <span className="tabular-nums">{money(-over)}</span> left
          </span>
        )}
      </p>
    </div>
  );
}
