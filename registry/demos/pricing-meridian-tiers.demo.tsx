"use client";

import { PricingMeridianTiers } from "@/registry/blocks/pricing-meridian-tiers/pricing-meridian-tiers";

/** The section at its own scale — full width, default narrative. */
export function PricingMeridianTiersDemo() {
  return (
    <div className="w-full">
      <PricingMeridianTiers />
    </div>
  );
}
