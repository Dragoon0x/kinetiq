"use client";

import { EmptyNoMatches } from "@/registry/blocks/empty-no-matches/empty-no-matches";
import { VignetteSearchSweep } from "@/registry/ui/vignette-search-sweep";

/** The section at its own scale — full width, default narrative, with its illustration seated in the art slot. */
export function EmptyNoMatchesDemo() {
  return (
    <div className="w-full">
      <EmptyNoMatches art={<VignetteSearchSweep />} />
    </div>
  );
}
