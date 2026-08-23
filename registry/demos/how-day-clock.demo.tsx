"use client";

import { HowDayClock } from "@/registry/blocks/how-day-clock/how-day-clock";

/** The section at its own scale — full width, default narrative. */
export function HowDayClockDemo() {
  return (
    <div className="w-full">
      <HowDayClock />
    </div>
  );
}
