"use client";

import { FeaturesSpecSheet } from "@/registry/blocks/features-spec-sheet/features-spec-sheet";

/** The section at its own scale — full width, default narrative. */
export function FeaturesSpecSheetDemo() {
  return (
    <div className="w-full">
      <FeaturesSpecSheet />
    </div>
  );
}
