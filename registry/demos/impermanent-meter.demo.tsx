"use client";

import * as React from "react";

import { ImpermanentMeter } from "@/registry/ui/impermanent-meter";
import { cn } from "@/registry/lib/utils";

const DEPOSIT = 23100;
const FEES = 186;
const RATIOS = [1, 1.5, 2, 3] as const;

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const percents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function ImpermanentMeterDemo() {
  const [ratio, setRatio] = React.useState<number>(1);

  const held = (DEPOSIT * (1 + ratio)) / 2;
  const gap = held - DEPOSIT * Math.sqrt(ratio);
  const net = FEES - gap;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ImpermanentMeter
        label="Basinworks Exchange"
        deposit={DEPOSIT}
        priceRatio={ratio}
        feesEarned={FEES}
        pair={["BSN", "FRN"]}
      />

      <div
        role="group"
        aria-label="Price of the pair since entry"
        className="flex flex-wrap items-center gap-2"
      >
        {RATIOS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={ratio === preset}
            onClick={() => setRatio(preset)}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-2 border px-3 font-mono text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              ratio === preset
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input bg-surface-1 text-foreground hover:bg-accent",
            )}
          >
            ×{preset.toFixed(1)}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Ratio{" "}
        <span className="text-signal tabular-nums">×{ratio.toFixed(1)}</span> ·
        divergence{" "}
        <span className="text-signal tabular-nums">
          −{percents.format((gap / held) * 100)}%
        </span>{" "}
        · net{" "}
        <span className="text-signal tabular-nums">
          {net >= 0 ? "+" : "−"}
          {currency.format(Math.abs(net))}
        </span>
      </p>
    </div>
  );
}
