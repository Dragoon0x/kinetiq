"use client";

import { RubberSheet } from "@/registry/ui/rubber-sheet";

export function RubberSheetDemo() {
  return (
    <div className="border-border bg-card w-full max-w-md rounded-4 border">
      <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-label text-ink-3">Membrane · Pull &amp; release</span>
        <span
          aria-hidden
          className="text-ink-3 font-mono text-[10px] tracking-wider tabular-nums"
        >
          9 × 7
        </span>
      </div>
      <div className="p-3">
        <RubberSheet
          columns={9}
          rows={7}
          height={260}
          aria-label="Elastic calibration membrane"
        />
      </div>
      <div className="border-border flex items-center justify-between border-t px-4 py-2">
        <span className="text-ink-3 font-mono text-[11px]">
          Drag the surface — it rings back.
        </span>
        <span className="text-ink-3 font-mono text-[10px] tracking-wider uppercase">
          ζ 0.53
        </span>
      </div>
    </div>
  );
}
