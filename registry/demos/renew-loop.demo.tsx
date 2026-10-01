"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RenewLoop } from "@/registry/ui/renew-loop";

export const tweaks = defineTweaks({
  period: {
    kind: "choice",
    label: "Period",
    default: "month",
    options: ["month", "quarter", "year"],
    names: { month: "Monthly", quarter: "Quarterly", year: "Yearly" },
  },
  chase: {
    kind: "range",
    label: "Chase",
    default: 240,
    min: 0,
    max: 540,
    step: 30,
    unit: "°",
  },
  flip: {
    kind: "range",
    label: "Flip",
    default: 90,
    min: 40,
    max: 200,
    step: 10,
    unit: "ms",
  },
});

/** The current term began on 15 Oct 2026; each plan renews one period on. */
const RENEWED_ON = "2026-10-15";

const PLANS = {
  month: { price: "€12", per: "month", renews: "15 Nov", ends: "14 Nov" },
  quarter: { price: "€33", per: "quarter", renews: "15 Jan", ends: "14 Jan" },
  year: { price: "€120", per: "year", renews: "15 Oct", ends: "14 Oct" },
} as const;

/**
 * Fernworks Pro, billed through Waylight Pay: the plan renews by itself while
 * the switch is on, and runs out the day before its renewal when it is off.
 */
export function RenewLoopDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [on, setOn] = React.useState(true);
  const plan = PLANS[values.period ?? "month"] ?? PLANS.month;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Fernworks Pro
          </p>
          <p className="truncate text-xs text-ink-3">
            Waylight Pay · {plan.price} / {plan.per}
          </p>
        </div>
        <RenewLoop
          pressed={on}
          onPressedChange={setOn}
          renewedOn={RENEWED_ON}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {on ? "auto-renew on" : "auto-renew off"}
          </span>
          {on
            ? ` · next charge ${plan.price} on ${plan.renews}`
            : ` · access ends ${plan.ends}`}
        </p>
      ) : null}
    </div>
  );
}
