"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PricingPlinth,
  defaultPricingPlans,
  type PricingCycle,
} from "@/registry/ui/pricing-plinth";

export const tweaks = defineTweaks({
  rise: {
    kind: "range",
    label: "Rise",
    default: 14,
    min: 0,
    max: 28,
    step: 2,
    unit: "px",
  },
  spotlight: {
    kind: "range",
    label: "Spotlight",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  cycle: {
    kind: "choice",
    label: "Billing",
    default: "monthly",
    options: ["monthly", "yearly"],
    names: { monthly: "Monthly", yearly: "Yearly" },
  },
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/**
 * Fernworks' upgrade page: three plans on their plinths, billed monthly or
 * yearly, and a Continue that hands the choice to checkout.
 */
export function PricingPlinthDemo({
  chrome = true,
  sound,
  cycle: cycleTweak = "monthly",
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plan, setPlan] = React.useState("studio");
  const [cycle, setCycle] = React.useState<PricingCycle>(cycleTweak);
  const [seenTweak, setSeenTweak] = React.useState(cycleTweak);
  if (seenTweak !== cycleTweak) {
    setSeenTweak(cycleTweak);
    setCycle(cycleTweak);
  }
  const [sent, setSent] = React.useState<string | null>(null);

  const chosen = defaultPricingPlans.find((p) => p.id === plan);
  const price = chosen
    ? cycle === "yearly"
      ? chosen.yearly
      : chosen.monthly
    : 0;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PricingPlinth
        value={plan}
        onValueChange={(id) => {
          setPlan(id);
          setSent(null);
        }}
        cycle={cycle}
        onCycleChange={(c) => {
          setCycle(c);
          setSent(null);
        }}
        onConfirm={(id, c) => setSent(`${id} · ${c}`)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{chosen?.name ?? "no plan"}</span>
          {price === 0
            ? " · free"
            : ` · ${usd.format(price)} a month · billed ${cycle}`}
          {sent ? " · sent to checkout" : ""}
        </p>
      ) : null}
    </div>
  );
}
