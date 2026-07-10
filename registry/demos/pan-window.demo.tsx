"use client";

import * as React from "react";

import { PanWindow, type PanHotspot } from "@/registry/ui/pan-window";

const RIDGE: PanHotspot[] = [
  { id: "north-mast", label: "NORTH MAST", x: 0.18, detail: "signal steady" },
  { id: "saddle-camp", label: "SADDLE CAMP", x: 0.52, detail: "two tents, one lamp" },
  { id: "far-beacon", label: "FAR BEACON", x: 0.86, detail: "sweeps every minute" },
];

export function PanWindowDemo() {
  const [visited, setVisited] = React.useState<string | null>(null);
  const spot = RIDGE.find((s) => s.id === visited);

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
          <p className="text-label text-ink-3">RIDGE SURVEY &middot; 03 MARKERS</p>
          <p className="text-label text-ink-3">KQ-084</p>
        </div>

        <PanWindow
          hotspots={RIDGE}
          height={230}
          aria-label="Ridge survey"
          onVisit={setVisited}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          LOGGED &middot;{" "}
          <span className="text-cobalt-bright">
            {spot ? spot.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Pan the ridge - markers step forward as they cross the glass.
        </p>
      </div>
    </div>
  );
}
