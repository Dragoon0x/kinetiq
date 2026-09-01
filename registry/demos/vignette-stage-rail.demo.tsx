"use client";

import { VignetteStageRail } from "@/registry/ui/vignette-stage-rail";

export function VignetteStageRailDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-10">
      <VignetteStageRail orient="row" />
      <VignetteStageRail orient="column" />
    </div>
  );
}
