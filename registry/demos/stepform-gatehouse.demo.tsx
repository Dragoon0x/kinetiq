"use client";

import { StepformGatehouse } from "@/registry/blocks/stepform-gatehouse/stepform-gatehouse";

/** The section at its own scale — full width, default narrative. */
export function StepformGatehouseDemo() {
  return (
    <div className="w-full">
      <StepformGatehouse />
    </div>
  );
}
