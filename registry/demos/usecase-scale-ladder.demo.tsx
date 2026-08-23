"use client";

import { UsecaseScaleLadder } from "@/registry/blocks/usecase-scale-ladder/usecase-scale-ladder";

/** The section at its own scale — full width, default narrative. */
export function UsecaseScaleLadderDemo() {
  return (
    <div className="w-full">
      <UsecaseScaleLadder />
    </div>
  );
}
