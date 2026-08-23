"use client";

import { ContentGlossary } from "@/registry/blocks/content-glossary/content-glossary";

/** The section at its own scale — full width, default narrative. */
export function ContentGlossaryDemo() {
  return (
    <div className="w-full">
      <ContentGlossary />
    </div>
  );
}
