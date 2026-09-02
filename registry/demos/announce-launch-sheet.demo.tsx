"use client";

import { AnnounceLaunchSheet } from "@/registry/blocks/announce-launch-sheet/announce-launch-sheet";

/** The section at its own scale — full width, default narrative, sheet closed so the reader opens it. */
export function AnnounceLaunchSheetDemo() {
  return (
    <div className="w-full">
      <AnnounceLaunchSheet />
    </div>
  );
}
