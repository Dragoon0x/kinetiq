"use client";

import { CtaSignatureLine } from "@/registry/blocks/cta-signature-line/cta-signature-line";

/** The section at its own scale — full width, default narrative. */
export function CtaSignatureLineDemo() {
  return (
    <div className="w-full">
      <CtaSignatureLine />
    </div>
  );
}
