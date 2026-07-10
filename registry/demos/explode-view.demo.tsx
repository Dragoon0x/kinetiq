"use client";

import * as React from "react";

import { ExplodeView, type Part } from "@/registry/ui/explode-view";

/** Fixed five-part assembly, bottom of the stack to top — never random. */
const PARTS: Part[] = [
  {
    id: "base-plate",
    label: "BASE PLATE",
    detail: "Milled aluminum - mounting bores at each corner.",
  },
  {
    id: "gasket",
    label: "GASKET",
    detail: "Nitrile seal - rated to 180 degrees C.",
  },
  {
    id: "rotor",
    label: "ROTOR",
    detail: "Balanced to G1.0 - keyed to the drive shaft.",
  },
  {
    id: "housing",
    label: "HOUSING",
    detail: "Die-cast shell - vents the rotor chamber.",
  },
  {
    id: "cap",
    label: "CAP",
    detail: "Snap-fit lid - torque spec 4 N·m.",
  },
];

/**
 * ExplodeView on the KQ-149 bezel: a five-part assembly that fans apart
 * along its iso axis on toggle, leader lines naming each part in the parked
 * column. The status line mirrors the exploded state exactly as ExplodeView
 * reports it through onToggle.
 */
export function ExplodeViewDemo() {
  const [exploded, setExploded] = React.useState(false);

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
          <p className="text-label text-ink-3">ASSEMBLY &middot; 05 PARTS</p>
          <p className="text-label text-ink-3">KQ-149</p>
        </div>
        <ExplodeView
          parts={PARTS}
          exploded={exploded}
          onToggle={setExploded}
          height={300}
          aria-label="Rotor assembly, exploded view"
        />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          VIEW &middot;{" "}
          <span className="text-cobalt-bright">
            {exploded ? "EXPLODED" : "ASSEMBLED"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Toggle to separate the stack - leaders name each part.
        </p>
      </div>
    </div>
  );
}
