"use client";

import * as React from "react";

import { FocusRack, type FocusPlane } from "@/registry/ui/focus-rack";

const PLANES: FocusPlane[] = [
  {
    id: "near",
    label: "NEAR FIELD",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>bench optics · 0.4m</p>
        <p>aperture f/2 · steady</p>
      </div>
    ),
  },
  {
    id: "mid",
    label: "MID FIELD",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>calibration rig · 2.1m</p>
        <p>target plate centered</p>
      </div>
    ),
  },
  {
    id: "far",
    label: "FAR FIELD",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>reference mast · 18m</p>
        <p>haze low · contrast good</p>
      </div>
    ),
  },
];

export function FocusRackDemo() {
  const [plane, setPlane] = React.useState("NEAR FIELD");

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
          <p className="text-label text-ink-3">FOCUS BENCH · 03 PLANES</p>
          <p className="text-label text-ink-3">KQ-065</p>
        </div>

        <FocusRack
          planes={PLANES}
          height={190}
          onFocusChange={(id) => {
            const hit = PLANES.find((p) => p.id === id);
            if (hit) setPlane(hit.label);
          }}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          IN FOCUS · <span className="text-cobalt-bright">{plane}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Rack the chips or click a soft plane - focus pulls it forward.
        </p>
      </div>
    </div>
  );
}
