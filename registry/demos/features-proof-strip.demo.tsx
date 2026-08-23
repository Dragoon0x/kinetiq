"use client";

import { FeaturesProofStrip } from "@/registry/blocks/features-proof-strip/features-proof-strip";

/** The section at its own scale — full width, default narrative. */
export function FeaturesProofStripDemo() {
  return (
    <div className="w-full">
      <FeaturesProofStrip />
    </div>
  );
}
