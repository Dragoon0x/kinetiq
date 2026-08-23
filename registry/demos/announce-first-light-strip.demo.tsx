"use client";

import { AnnounceFirstLightStrip } from "@/registry/blocks/announce-first-light-strip/announce-first-light-strip";

/** The section at its own scale — full width, default narrative. */
export function AnnounceFirstLightStripDemo() {
  return (
    <div className="w-full">
      <AnnounceFirstLightStrip />
    </div>
  );
}
