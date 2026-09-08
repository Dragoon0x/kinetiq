"use client";

import * as React from "react";

import { StopRail, type StopRailValue } from "@/registry/ui/stop-rail";

const SIZE = 40;
const START: StopRailValue = { stop: 23.3, entry: 24.2, target: 26.6 };

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function StopRailDemo() {
  const [plan, setPlan] = React.useState<StopRailValue>(START);

  const risk = Math.abs(plan.entry - plan.stop) * SIZE;
  const reward = Math.abs(plan.target - plan.entry) * SIZE;
  const ratio = risk === 0 ? 0 : reward / risk;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <StopRail
        symbol="BSN"
        side="long"
        size={SIZE}
        low={22}
        high={28}
        step={0.05}
        value={plan}
        onValueChange={setPlan}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Risk <span className="tabular-nums">{money.format(risk)}</span> · reward{" "}
        <span className="tabular-nums">{money.format(reward)}</span> ·{" "}
        <span className="text-signal tabular-nums">{ratio.toFixed(2)}R</span>
      </p>
    </div>
  );
}
