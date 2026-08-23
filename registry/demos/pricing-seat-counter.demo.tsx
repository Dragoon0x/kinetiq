"use client";

import { PricingSeatCounter } from "@/registry/blocks/pricing-seat-counter/pricing-seat-counter";

/** The section at its own scale — full width, default narrative. */
export function PricingSeatCounterDemo() {
  return (
    <div className="w-full">
      <PricingSeatCounter />
    </div>
  );
}
