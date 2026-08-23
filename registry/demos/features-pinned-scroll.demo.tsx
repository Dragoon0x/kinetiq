"use client";

import { FeaturesPinnedScroll } from "@/registry/blocks/features-pinned-scroll/features-pinned-scroll";

/** The section at its own scale — full width, default narrative. */
export function FeaturesPinnedScrollDemo() {
  return (
    <div className="w-full">
      <FeaturesPinnedScroll />
    </div>
  );
}
