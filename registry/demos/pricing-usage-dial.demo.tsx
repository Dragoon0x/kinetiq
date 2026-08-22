"use client";

import { PricingUsageDial } from "@/registry/blocks/pricing-usage-dial/pricing-usage-dial";

/** The section at its own scale — full width, default narrative. */
export function PricingUsageDialDemo() {
  return (
    <div className="w-full">
      <PricingUsageDial />
    </div>
  );
}
