"use client";

import * as React from "react";

import { AgentDesk } from "@/registry/blocks/agent-desk/agent-desk";
import { VignetteAppWindow } from "@/registry/ui/vignette-app-window";
import { VignetteHub } from "@/registry/ui/vignette-hub";

/**
 * The library demonstrating itself: two self-running vignettes side by side
 * with the agent desk beneath, all straight from the registry with default
 * props — if the home page needed special versions, the components would be
 * the problem.
 */
export function SelfDemoStrip() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-center gap-6 lg:grid-cols-2">
        <div className="border-hairline rounded-4 bg-surface-1 flex min-h-[300px] items-center justify-center overflow-hidden border p-6">
          <VignetteAppWindow />
        </div>
        <div className="border-hairline rounded-4 bg-surface-1 flex min-h-[300px] items-center justify-center overflow-hidden border p-6">
          <VignetteHub layout="mesh" />
        </div>
      </div>
      <div className="border-hairline rounded-4 bg-surface-1 overflow-hidden border p-6">
        <div className="flex w-full justify-center">
          <AgentDesk />
        </div>
      </div>
    </div>
  );
}
