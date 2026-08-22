"use client";

import { FeaturesLedgerRows } from "@/registry/blocks/features-ledger-rows/features-ledger-rows";

/** The section at its own scale — full width, default narrative. */
export function FeaturesLedgerRowsDemo() {
  return (
    <div className="w-full">
      <FeaturesLedgerRows />
    </div>
  );
}
