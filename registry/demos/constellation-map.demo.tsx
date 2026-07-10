"use client";

import * as React from "react";

import { ConstellationMap, type Star } from "@/registry/ui/constellation-map";

/** Eight named, pinnable stars — the catalog the bezel header counts. */
const NAMED_STARS: Star[] = [
  { id: "vega", label: "VEGA" },
  { id: "rigel", label: "RIGEL" },
  { id: "altair", label: "ALTAIR" },
  { id: "deneb", label: "DENEB" },
  { id: "polaris", label: "POLARIS" },
  { id: "antares", label: "ANTARES" },
  { id: "sirius", label: "SIRIUS" },
  { id: "capella", label: "CAPELLA" },
];

/**
 * ConstellationMap dressed as a bench instrument: a bezel plate with corner
 * ticks, a mono catalog header, and a status line that mirrors the pinned
 * star. The map carries its own drag/hover/pin/keyboard interaction; this
 * demo only reflects `onPin` back into the status readout below it.
 */
export function ConstellationMapDemo() {
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const pinnedStar = NAMED_STARS.find((star) => star.id === pinnedId) ?? null;

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
          <p className="text-label text-ink-3">STAR CATALOG &middot; 08 NAMED</p>
          <p className="text-label text-ink-3">KQ-134</p>
        </div>

        <ConstellationMap
          stars={NAMED_STARS}
          extra={60}
          height={300}
          onPin={setPinnedId}
          aria-label="Constellation map"
        />

        <p role="status" className="border-hairline text-label text-ink-3 mt-3 border-t pt-3">
          PINNED &middot;{" "}
          <span className="text-cobalt-bright">
            {pinnedStar ? pinnedStar.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag to turn the sky - hover to draw links, click to pin a star.
        </p>
      </div>
    </div>
  );
}
