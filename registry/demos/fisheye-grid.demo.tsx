"use client";

import * as React from "react";

import { FisheyeGrid, type FisheyeCell } from "@/registry/ui/fisheye-grid";

/** Two-char hex glyph codes, deterministic — row is the high nibble. */
const HEX = "0123456789ABCDEF";
const CELLS: FisheyeCell[] = Array.from({ length: 36 }, (_, i) => {
  const row = Math.floor(i / 6);
  const col = i % 6;
  const label = `${HEX[row] ?? "0"}${HEX[col] ?? "0"}`;
  return { id: `glyph-${label}`, label };
});

export function FisheyeGridDemo() {
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const focusedCell = CELLS.find((cell) => cell.id === focusedId) ?? null;

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
          <p className="text-label text-ink-3">GLYPH TABLE &middot; 36 TILES</p>
          <p className="text-label text-ink-3">KQ-145</p>
        </div>

        <FisheyeGrid
          cells={CELLS}
          columns={6}
          height={300}
          onFocusCell={setFocusedId}
          aria-label="Glyph table fisheye grid"
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          UNDER LENS &middot;{" "}
          <span className="text-cobalt-bright">
            {focusedCell ? focusedCell.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Sweep the lens - tiles bulge up as they pass beneath it.
        </p>
      </div>
    </div>
  );
}
