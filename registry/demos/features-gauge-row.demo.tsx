"use client";

import { FeaturesGaugeRow } from "@/registry/blocks/features-gauge-row/features-gauge-row";

/** The section at its own scale — full width, default narrative. */
export function FeaturesGaugeRowDemo() {
  return (
    <div className="w-full">
      <FeaturesGaugeRow />
    </div>
  );
}
