"use client";

import { FaqSplitRegistry } from "@/registry/blocks/faq-split-registry/faq-split-registry";

/** The section at its own scale — full width, default narrative. */
export function FaqSplitRegistryDemo() {
  return (
    <div className="w-full">
      <FaqSplitRegistry />
    </div>
  );
}
