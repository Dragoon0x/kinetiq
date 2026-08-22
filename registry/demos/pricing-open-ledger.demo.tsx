"use client";

import { PricingOpenLedger } from "@/registry/blocks/pricing-open-ledger/pricing-open-ledger";

/** The section at its own scale — full width, default narrative. */
export function PricingOpenLedgerDemo() {
  return (
    <div className="w-full">
      <PricingOpenLedger />
    </div>
  );
}
