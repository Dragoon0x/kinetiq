"use client";

import { OfferLedger } from "@/registry/blocks/offer-ledger/offer-ledger";

/** The section at its own scale — full width, default narrative. */
export function OfferLedgerDemo() {
  return (
    <div className="w-full">
      <OfferLedger />
    </div>
  );
}
