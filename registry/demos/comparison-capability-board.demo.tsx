"use client";

import { ComparisonCapabilityBoard } from "@/registry/blocks/comparison-capability-board/comparison-capability-board";

/** The section at its own scale — full width, default narrative. */
export function ComparisonCapabilityBoardDemo() {
  return (
    <div className="w-full">
      <ComparisonCapabilityBoard />
    </div>
  );
}
