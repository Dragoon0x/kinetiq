"use client";

import * as React from "react";

import { CameraRail, type RailStation } from "@/registry/ui/camera-rail";

const STATIONS: RailStation[] = [
  { id: "pier-head", label: "PIER HEAD" },
  { id: "old-town", label: "OLD TOWN" },
  { id: "signal-yard", label: "SIGNAL YARD" },
  { id: "harbor-view", label: "HARBOR VIEW" },
  { id: "north-gate", label: "NORTH GATE" },
];

export function CameraRailDemo() {
  const [arrivedId, setArrivedId] = React.useState<string>("signal-yard");
  const station = STATIONS.find((s) => s.id === arrivedId);

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
          <p className="text-label text-ink-3">COAST LINE &middot; 05 STATIONS</p>
          <p className="text-label text-ink-3">KQ-088</p>
        </div>

        <CameraRail
          stations={STATIONS}
          defaultValue="signal-yard"
          height={280}
          aria-label="Coast line camera rail"
          onArrive={setArrivedId}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          AT PLATFORM &middot;{" "}
          <span className="text-cobalt-bright">
            {station ? station.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag the rail - a station glides in and snaps to the platform.
        </p>
      </div>
    </div>
  );
}
