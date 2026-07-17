"use client";

import { CursorLabel } from "@/registry/ui/cursor-label";

export function CursorLabelDemo() {
  return (
    <div className="w-full max-w-sm">
      <CursorLabel className="border-hairline bg-surface-1 rounded-3 border p-4">
        <p className="text-ink-3 mb-3 font-mono text-[10px] tracking-[0.08em] uppercase">
          Move across the zones
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div
            data-cursor="Open"
            className="bg-surface-2 border-hairline flex h-20 items-center justify-center rounded-2 border text-sm font-medium"
          >
            Specimen
          </div>
          <div
            data-cursor="Drag"
            className="bg-surface-2 border-hairline flex h-20 items-center justify-center rounded-2 border text-sm font-medium"
          >
            Handle
          </div>
          <div
            data-cursor="View"
            className="bg-surface-2 border-hairline flex h-20 items-center justify-center rounded-2 border text-sm font-medium"
          >
            Readout
          </div>
          <div className="bg-surface-0 border-hairline flex h-20 items-center justify-center rounded-2 border text-sm">
            (no label)
          </div>
        </div>
      </CursorLabel>
    </div>
  );
}
