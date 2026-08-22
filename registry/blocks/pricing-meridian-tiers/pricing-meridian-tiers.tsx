"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { StatusSeal } from "@/registry/ui/status-seal";
import { cn } from "@/registry/lib/utils";

export type MeridianTier = {
  id: string;
  name: string;
  blurb: string;
  /** Monthly price per billing mode. */
  monthly: number;
  annual: number;
  cta: string;
  features: string[];
  sealed?: string;
};

export type PricingMeridianTiersProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  tiers?: MeridianTier[];
  onSelect?: (tierId: string, billing: "monthly" | "annual") => void;
  className?: string;
};

const DEFAULT_TIERS: MeridianTier[] = [
  {
    id: "field",
    name: "Field",
    blurb: "For a single bench getting its footing.",
    monthly: 0,
    annual: 0,
    cta: "Start free",
    features: ["One bench", "14-day history", "Community recipes"],
  },
  {
    id: "crew",
    name: "Crew",
    blurb: "For teams that ship every week.",
    monthly: 24,
    annual: 19,
    sealed: "Most chosen",
    cta: "Start Crew",
    features: [
      "Unlimited benches",
      "Full history, forever",
      "Shared recipe lineage",
      "Priority queue",
    ],
  },
  {
    id: "works",
    name: "Works",
    blurb: "For the whole floor, with controls.",
    monthly: 64,
    annual: 52,
    cta: "Talk to us",
    features: [
      "Everything in Crew",
      "SSO and audit export",
      "Dedicated capacity",
      "Support with a name",
    ],
  },
];

/**
 * Three tiers under one billing switch. The switch is the library's own
 * segmented control, and the prices are readouts — flip the billing and every
 * numeral carry-rolls to its new value instead of blinking, so the difference
 * between the modes is something you watch happen. The chosen tier stands a
 * little taller and carries a seal; the maths never moves a card.
 */
export function PricingMeridianTiers({
  eyebrow = "Fieldline · pricing",
  headline = "Pay for the floor you actually run.",
  copy = "Every tier includes the full instrument set. The difference is scale, history, and who answers when you call.",
  tiers = DEFAULT_TIERS,
  onSelect,
  className,
}: PricingMeridianTiersProps) {
  const headingId = React.useId();
  const [billing, setBilling] = React.useState<"monthly" | "annual">("annual");

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>

          <div className="mt-8 flex justify-center">
            <SegmentedControl
              aria-label="Billing period"
              value={billing}
              onValueChange={(v) => setBilling(v as "monthly" | "annual")}
            >
              <SegmentedControlItem value="monthly">Monthly</SegmentedControlItem>
              <SegmentedControlItem value="annual">
                Annual · save 20%
              </SegmentedControlItem>
            </SegmentedControl>
          </div>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
          {tiers.map((tier) => {
            const price = billing === "annual" ? tier.annual : tier.monthly;
            const lead = Boolean(tier.sealed);
            return (
              <div
                key={tier.id}
                className={cn(
                  "border-hairline bg-surface-1 rounded-4 relative flex flex-col border p-6",
                  lead && "border-hairline-strong shadow-raised md:-my-3 md:py-9",
                )}
              >
                {tier.sealed && (
                  <StatusSeal
                    variant="info"
                    className="absolute -top-3 left-6"
                  >
                    {tier.sealed}
                  </StatusSeal>
                )}
                <h3 className="font-semibold">{tier.name}</h3>
                <p className="text-ink-3 mt-1 text-sm">{tier.blurb}</p>

                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-ink-3 text-lg">$</span>
                  <Readout value={price} size="lg" />
                  <span className="text-ink-3 text-sm">/ seat / month</span>
                </p>
                <p className="text-label text-ink-3 mt-1 min-h-4">
                  {billing === "annual" && price > 0 ? "billed annually" : " "}
                </p>

                <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="text-ink-2 flex items-start gap-2.5 text-sm">
                      <Check
                        className="text-[var(--success,var(--primary))] mt-0.5 size-4 shrink-0"
                        aria-hidden
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <PressureButton
                  variant={lead ? "solid" : "outline"}
                  className="mt-6 w-full"
                  onClick={() => onSelect?.(tier.id, billing)}
                >
                  {tier.cta}
                </PressureButton>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
