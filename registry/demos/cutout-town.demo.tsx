"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { CutoutTown, type TownBuilding } from "@/registry/ui/cutout-town";

/** The KQ-126 quarter survey — plots, sizes, and positions never vary. */
const BUILDINGS: TownBuilding[] = [
  { id: "press-hall", label: "PRESS HALL", width: 72, height: 88, x: 8 },
  { id: "clock-tower", label: "CLOCK TOWER", width: 40, height: 132, x: 34 },
  { id: "arcade", label: "ARCADE", width: 96, height: 64, x: 52 },
  { id: "signal-house", label: "SIGNAL HOUSE", width: 52, height: 96, x: 80 },
];

/**
 * CutoutTown dressed as the KQ-126 paper quarter: four cutouts stand up from
 * their plots as you scroll — the press hall first at the left, the signal
 * house last at the edge of the plan. The status line mirrors the standing
 * count, pinned to the full quarter under reduced motion to match the town.
 */
export function CutoutTownDemo() {
  const motionSafe = useMotionSafe();
  const [raised, setRaised] = React.useState(0);
  const shown = motionSafe ? raised : BUILDINGS.length;

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
          <p className="text-label text-ink-3">
            PAPER QUARTER &middot; 04 PLOTS
          </p>
          <p className="text-label text-ink-3 tabular-nums">KQ-126</p>
        </div>

        <CutoutTown
          buildings={BUILDINGS}
          stageHeight={270}
          onRaised={setRaised}
          aria-label="Paper quarter town plan"
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          RAISED &middot;{" "}
          <span className="text-cobalt-bright tabular-nums">
            {shown}/{BUILDINGS.length}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll the plan - each building stands up from its plot.
        </p>
      </div>
    </div>
  );
}
