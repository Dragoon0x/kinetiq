"use client";

import * as React from "react";

import { SlippageDial } from "@/registry/ui/slippage-dial";

const QUOTE = 3104.5;

const amounts = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SlippageDialDemo() {
  const [tolerance, setTolerance] = React.useState(0.5);

  const wide = tolerance >= 5;
  const minimum = Math.max(0, QUOTE * (1 - tolerance / 100));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SlippageDial
        label="Basinworks Exchange · 250 BSN"
        expected={QUOTE}
        value={tolerance}
        onValueChange={setTolerance}
        symbol="FRN"
      />

      <button
        type="button"
        onClick={() => setTolerance(wide ? 0.5 : 5)}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {wide ? "Back to 0.5%" : "Widen to 5%"}
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Tolerance{" "}
        <span className="text-signal tabular-nums">
          {amounts.format(tolerance)}%
        </span>{" "}
        — Min{" "}
        <span className="text-signal tabular-nums">
          {amounts.format(minimum)} FRN
        </span>
      </p>
    </div>
  );
}
