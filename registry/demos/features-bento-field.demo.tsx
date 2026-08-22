"use client";

import { FeaturesBentoField } from "@/registry/blocks/features-bento-field/features-bento-field";

/** The section at its own scale — full width, default narrative. */
export function FeaturesBentoFieldDemo() {
  return (
    <div className="w-full">
      <FeaturesBentoField />
    </div>
  );
}
