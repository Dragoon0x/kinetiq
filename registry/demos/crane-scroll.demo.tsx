"use client";

import * as React from "react";

import { CraneScroll, type CraneTile } from "@/registry/ui/crane-scroll";

const PLOTS: CraneTile[] = [
  { id: "a1", label: "PLOT A1" },
  { id: "a2", label: "PLOT A2" },
  { id: "a3", label: "PLOT A3" },
  { id: "b1", label: "PLOT B1" },
  { id: "b2", label: "PLOT B2" },
  { id: "b3", label: "PLOT B3" },
];

export function CraneScrollDemo() {
  const [stage, setStage] = React.useState("TOP-DOWN");

  const handleCrane = (progress: number) => {
    const next =
      progress < 0.33 ? "TOP-DOWN" : progress < 0.66 ? "THREE-QUARTER" : "FRONT";
    setStage(next);
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
          <p className="text-label text-ink-3">SITE SURVEY &middot; 06 PLOTS</p>
          <p className="text-label text-ink-3">KQ-086</p>
        </div>

        <CraneScroll
          tiles={PLOTS}
          journey={3}
          height={280}
          aria-label="Site survey crane shot"
          onCrane={handleCrane}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          CRANE &middot; <span className="text-cobalt-bright">{stage}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll to crane the camera from overhead down to eye level.
        </p>
      </div>
    </div>
  );
}
