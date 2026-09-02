"use client";

import { EmptyNeedsAccess } from "@/registry/blocks/empty-needs-access/empty-needs-access";
import { VignetteEmptyDrawer } from "@/registry/ui/vignette-empty-drawer";

/** The section at its own scale — full width, default narrative, with its illustration seated in the art slot. */
export function EmptyNeedsAccessDemo() {
  return (
    <div className="w-full">
      <EmptyNeedsAccess art={<VignetteEmptyDrawer />} />
    </div>
  );
}
