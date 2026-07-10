"use client";

import * as React from "react";

import { BlueprintRise, type WallSeg } from "@/registry/ui/blueprint-rise";

/** Unit 4B: a living room, two bedrooms off a shared divider, and a closet nook. */
const WALLS: WallSeg[] = [
  { id: "north", x1: 0.08, y1: 0.08, x2: 0.92, y2: 0.08 },
  { id: "east", x1: 0.92, y1: 0.08, x2: 0.92, y2: 0.88 },
  { id: "south-1", x1: 0.92, y1: 0.88, x2: 0.55, y2: 0.88 },
  { id: "south-2", x1: 0.42, y1: 0.88, x2: 0.08, y2: 0.88 },
  { id: "west", x1: 0.08, y1: 0.88, x2: 0.08, y2: 0.08 },
  { id: "divider-v1", x1: 0.5, y1: 0.08, x2: 0.5, y2: 0.42 },
  { id: "divider-v2", x1: 0.5, y1: 0.58, x2: 0.5, y2: 0.88 },
  { id: "divider-h", x1: 0.5, y1: 0.5, x2: 0.92, y2: 0.5 },
  { id: "closet-v", x1: 0.72, y1: 0.08, x2: 0.72, y2: 0.28, h: 0.7 },
  { id: "closet-h", x1: 0.72, y1: 0.28, x2: 0.92, y2: 0.28, h: 0.7 },
];

const LABELS = [
  { id: "living", x: 0.28, y: 0.55, text: "LIVING" },
  { id: "bed-1", x: 0.72, y: 0.18, text: "BED 1" },
  { id: "bed-2", x: 0.72, y: 0.72, text: "BED 2" },
];

export function BlueprintRiseDemo() {
  const [pct, setPct] = React.useState(0);

  const handleRise = (progress: number) => {
    setPct(Math.round(progress * 100));
  };

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
          <p className="text-label text-ink-3">FLOOR PLAN &middot; UNIT 4B</p>
          <p className="text-label text-ink-3">KQ-148</p>
        </div>

        <BlueprintRise
          walls={WALLS}
          labels={LABELS}
          journey={3}
          height={300}
          aria-label="Unit 4B floor plan rise"
          onRise={handleRise}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          RISE &middot; <span className="text-cobalt-bright">{pct}%</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll to raise the walls from plan into a model.
        </p>
      </div>
    </div>
  );
}
