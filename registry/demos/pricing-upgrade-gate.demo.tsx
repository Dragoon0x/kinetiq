"use client";

import { PricingUpgradeGate } from "@/registry/blocks/pricing-upgrade-gate/pricing-upgrade-gate";

/** The section at its own scale — full width, default narrative. */
export function PricingUpgradeGateDemo() {
  return (
    <div className="w-full">
      <PricingUpgradeGate />
    </div>
  );
}
