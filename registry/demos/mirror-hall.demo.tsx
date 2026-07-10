"use client";

import * as React from "react";

import { MirrorHall } from "@/registry/ui/mirror-hall";

function Plate() {
  return (
    <div className="border-hairline bg-surface-2 flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-3 border shadow-[0_8px_24px_rgb(0_0_0/0.3)]">
      <span className="text-label text-ink-3">SPECIMEN</span>
      <span className="text-cobalt-bright font-mono text-sm tracking-widest">
        K-097
      </span>
    </div>
  );
}

export function MirrorHallDemo() {
  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">MIRROR HALL · 05 REFLECTIONS</p>
          <p className="text-label text-ink-3">KQ-097</p>
        </div>

        <MirrorHall copies={5} height={220}>
          <Plate />
        </MirrorHall>

        <p className="text-ink-3 mt-3 text-center text-xs">
          Move across the hall - the deeper mirrors swing the farthest.
        </p>
      </div>
    </div>
  );
}
