"use client";

import * as React from "react";

import { HoverRelief, type ReliefTile } from "@/registry/ui/hover-relief";

/** Indexed golden-angle hues — deterministic, never random. */
const dotFor = (i: number) => (
  <span
    className="size-2 rounded-full"
    style={{ background: `oklch(0.74 0.14 ${(i * 137.5) % 360})` }}
  />
);

const HINTS: Record<number, string> = {
  2: "surveyed",
  5: "pending",
  7: "flagged",
  10: "clear",
};

const TILES: ReliefTile[] = Array.from({ length: 12 }, (_, i) => ({
  id: `s-${String(i + 1).padStart(2, "0")}`,
  label: `S-${String(i + 1).padStart(2, "0")}`,
  glyph: dotFor(i),
  hint: HINTS[i],
}));

export function HoverReliefDemo() {
  const [surveyed, setSurveyed] = React.useState<string | null>(null);

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
          <p className="text-label text-ink-3">SECTOR RELIEF · 12 TILES</p>
          <p className="text-label text-ink-3">KQ-064</p>
        </div>

        <HoverRelief
          tiles={TILES}
          columns={4}
          aria-label="Sector relief grid"
          onTileClick={(id) => setSurveyed(id.toUpperCase())}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          SURVEYED ·{" "}
          <span className="text-cobalt-bright">{surveyed ?? "NONE"}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Sweep the board - the relief follows your hand; click to survey.
        </p>
      </div>
    </div>
  );
}
