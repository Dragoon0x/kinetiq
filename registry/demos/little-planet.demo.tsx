"use client";

import * as React from "react";

import { LittlePlanet, type PlanetSection } from "@/registry/ui/little-planet";

/** Six mono stop names spaced evenly around the rim. */
const STOPS: PlanetSection[] = [
  { id: "harbor", label: "HARBOR" },
  { id: "market", label: "MARKET" },
  { id: "summit", label: "SUMMIT" },
  { id: "delta", label: "DELTA" },
  { id: "reef", label: "REEF" },
  { id: "outpost", label: "OUTPOST" },
];

/**
 * KQ-142: a world tour on the rim of a little planet. Spinning brings the
 * next stop up to the top slot; the status line mirrors whichever stop last
 * surfaced.
 */
export function LittlePlanetDemo() {
  const [surfacedId, setSurfacedId] = React.useState<string>("harbor");
  const stop = STOPS.find((section) => section.id === surfacedId);

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
          <p className="text-label text-ink-3">WORLD TOUR &middot; 06 STOPS</p>
          <p className="text-label text-ink-3">KQ-142</p>
        </div>
        <LittlePlanet
          sections={STOPS}
          defaultValue="harbor"
          radius={92}
          height={320}
          aria-label="World tour"
          onSurface={setSurfacedId}
        />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          AT THE TOP &middot;{" "}
          <span className="text-cobalt-bright">
            {stop ? stop.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Spin the planet - each stop curves up to the top.
        </p>
      </div>
    </div>
  );
}
