"use client";

import { StatsSignalBand } from "@/registry/blocks/stats-signal-band/stats-signal-band";

/** The section at its own scale — full width, default narrative. */
export function StatsSignalBandDemo() {
  return (
    <div className="w-full">
      <StatsSignalBand />
    </div>
  );
}
