"use client";

import { PricingSingleLine } from "@/registry/blocks/pricing-single-line/pricing-single-line";

/** The section at its own scale — full width, default narrative. */
export function PricingSingleLineDemo() {
  return (
    <div className="w-full">
      <PricingSingleLine />
    </div>
  );
}
