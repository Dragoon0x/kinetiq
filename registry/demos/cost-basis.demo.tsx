"use client";

import * as React from "react";

import { CostBasis } from "@/registry/ui/cost-basis";

/** Cents, so a long run of re-marks cannot drift the way floating money does. */
const SEED_MARK = 4360;
const COST = 3650;
const SHARES = 340;
const STEP = 145;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function CostBasisDemo() {
  const [mark, setMark] = React.useState(SEED_MARK);
  const [perShare, setPerShare] = React.useState(false);

  const paid = (SHARES * COST) / 100;
  const worth = (SHARES * mark) / 100;
  const percent = ((worth - paid) / paid) * 100;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CostBasis
        label="Coldbrook Bank · lot detail"
        symbol="BSN"
        shares={SHARES}
        costPerShare={COST / 100}
        price={mark / 100}
        perShare={perShare}
        onPerShareChange={setPerShare}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => setMark((current) => current + STEP)}
        >
          Mark up
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => setMark((current) => Math.max(400, current - STEP))}
        >
          Mark down
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={mark === SEED_MARK}
          onClick={() => setMark(SEED_MARK)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Worth{" "}
        <span className="text-signal tabular-nums">{money.format(worth)}</span>{" "}
        · paid <span className="tabular-nums">{money.format(paid)}</span> ·{" "}
        <span className="tabular-nums">
          {percent >= 0 ? "+" : "-"}
          {Math.abs(percent).toFixed(1)}%
        </span>{" "}
        · per share {perShare ? "on" : "off"}
      </p>
    </div>
  );
}
