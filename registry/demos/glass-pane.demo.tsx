"use client";

import * as React from "react";

import { GlassPane, type GlassSheet } from "@/registry/ui/glass-pane";

const SHEETS: GlassSheet[] = [
  {
    id: "grid",
    label: "SUBSTRATE",
    content: (
      <div className="text-ink-3 font-mono text-[10px]">
        <p>bus rails · ground plane</p>
      </div>
    ),
  },
  {
    id: "routes",
    label: "ROUTING",
    content: (
      <div className="text-ink-3 mt-8 font-mono text-[10px]">
        <p>fourteen traces · two vias</p>
      </div>
    ),
  },
  {
    id: "legend",
    label: "LEGEND",
    content: (
      <div className="text-ink-2 mt-16 space-y-1 font-mono text-xs">
        <p>three sheets, one assembly</p>
        <p>hover to part the glass</p>
      </div>
    ),
  },
];

export function GlassPaneDemo() {
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
          <p className="text-label text-ink-3">SCHEMATIC GLASS · 03 SHEETS</p>
          <p className="text-label text-ink-3">KQ-091</p>
        </div>

        <GlassPane sheets={SHEETS} height={210} separation={14} />

        <p className="text-ink-3 mt-3 text-center text-xs">
          Bring the pointer in - the sheets part and the light follows.
        </p>
      </div>
    </div>
  );
}
