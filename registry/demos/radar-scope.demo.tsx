"use client";

import * as React from "react";

import { type Blip, RadarScope } from "@/registry/ui/radar-scope";

// Six contacts spread across bearing/range, fixed so the scope renders
// identically on every visit.
const BLIPS: Blip[] = [
  { id: "c1", label: "VESSEL 7", bearing: 34, range: 0.72, detail: "Inbound, steady bearing" },
  { id: "c2", label: "BUOY N", bearing: 90, range: 0.38, detail: "Stationary marker" },
  { id: "c3", label: "SQUALL", bearing: 148, range: 0.86, detail: "Weather cell, expanding" },
  { id: "c4", label: "VESSEL 2", bearing: 205, range: 0.55, detail: "Crossing, slow" },
  { id: "c5", label: "REEF LIGHT", bearing: 262, range: 0.24, detail: "Fixed navigation aid" },
  { id: "c6", label: "TANKER 9", bearing: 317, range: 0.64, detail: "Outbound, holding course" },
];

/**
 * RadarScope dressed as an approach-scope instrument: a bezel plate with
 * corner registration ticks, a mono spec header, and a status line that
 * mirrors whichever contact is currently inspected.
 */
export function RadarScopeDemo() {
  const [inspectedId, setInspectedId] = React.useState<string | null>(null);
  const blip = BLIPS.find((b) => b.id === inspectedId) ?? null;

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
          <p className="text-label text-ink-3">APPROACH SCOPE &middot; 06 CONTACTS</p>
          <p className="text-label text-ink-3">KQ-144</p>
        </div>

        <RadarScope
          blips={BLIPS}
          height={300}
          aria-label="Approach scope with six contacts"
          onInspect={setInspectedId}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          CONTACT &middot;{" "}
          <span className="text-cobalt-bright">{blip ? blip.label : "NONE"}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Watch the sweep light the contacts - click one to inspect.
        </p>
      </div>
    </div>
  );
}
