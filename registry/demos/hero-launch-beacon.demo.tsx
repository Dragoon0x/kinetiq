"use client";

import { HeroLaunchBeacon } from "@/registry/blocks/hero-launch-beacon/hero-launch-beacon";

/** The section at its own scale — full width, default narrative. */
export function HeroLaunchBeaconDemo() {
  return (
    <div className="w-full">
      <HeroLaunchBeacon />
    </div>
  );
}
