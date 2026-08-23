"use client";

import { HeroAgentBench } from "@/registry/blocks/hero-agent-bench/hero-agent-bench";

/** The section at its own scale — full width, default narrative. */
export function HeroAgentBenchDemo() {
  return (
    <div className="w-full">
      <HeroAgentBench />
    </div>
  );
}
