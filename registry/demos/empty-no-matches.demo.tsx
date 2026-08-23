"use client";

import { EmptyNoMatches } from "@/registry/blocks/empty-no-matches/empty-no-matches";

/** The section at its own scale — full width, default narrative. */
export function EmptyNoMatchesDemo() {
  return (
    <div className="w-full">
      <EmptyNoMatches />
    </div>
  );
}
