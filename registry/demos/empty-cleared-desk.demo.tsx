"use client";

import { EmptyClearedDesk } from "@/registry/blocks/empty-cleared-desk/empty-cleared-desk";
import { VignetteInboxZero } from "@/registry/ui/vignette-inbox-zero";

/** The section at its own scale — full width, default narrative, with its illustration seated in the art slot. */
export function EmptyClearedDeskDemo() {
  return (
    <div className="w-full">
      <EmptyClearedDesk art={<VignetteInboxZero />} />
    </div>
  );
}
