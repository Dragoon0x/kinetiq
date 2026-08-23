"use client";

import { PricingCreditPacks } from "@/registry/blocks/pricing-credit-packs/pricing-credit-packs";

/** The section at its own scale — full width, default narrative. */
export function PricingCreditPacksDemo() {
  return (
    <div className="w-full">
      <PricingCreditPacks />
    </div>
  );
}
