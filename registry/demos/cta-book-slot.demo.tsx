"use client";

import { CtaBookSlot } from "@/registry/blocks/cta-book-slot/cta-book-slot";

/** The section at its own scale — full width, default narrative. */
export function CtaBookSlotDemo() {
  return (
    <div className="w-full">
      <CtaBookSlot />
    </div>
  );
}
