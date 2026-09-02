"use client";

import { EmptyFirstLight } from "@/registry/blocks/empty-first-light/empty-first-light";
import { VignetteBlankBoard } from "@/registry/ui/vignette-blank-board";

/** The section at its own scale — full width, default narrative, with its illustration seated in the art slot. */
export function EmptyFirstLightDemo() {
  return (
    <div className="w-full">
      <EmptyFirstLight art={<VignetteBlankBoard />} />
    </div>
  );
}
