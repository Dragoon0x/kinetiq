"use client";

import { HowStationLine } from "@/registry/blocks/how-station-line/how-station-line";

/** The section at its own scale — full width, default narrative. */
export function HowStationLineDemo() {
  return (
    <div className="w-full">
      <HowStationLine />
    </div>
  );
}
