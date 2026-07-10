"use client";

import * as React from "react";

import { SectionCut, type Stratum } from "@/registry/ui/section-cut";

/** Six deterministic strata, top to bottom, with varied thickness and tone. */
const STRATA: Stratum[] = [
  { id: "topsoil", label: "TOPSOIL", thickness: 0.6, tone: 0.15 },
  { id: "clay", label: "CLAY", thickness: 0.9, tone: 0.3 },
  { id: "sandstone", label: "SANDSTONE", thickness: 1.3, tone: 0.5 },
  { id: "shale", label: "SHALE", thickness: 1, tone: 0.68 },
  { id: "limestone", label: "LIMESTONE", thickness: 1.1, tone: 0.42 },
  { id: "bedrock", label: "BEDROCK", thickness: 1.6, tone: 0.92 },
];

export function SectionCutDemo() {
  const [cutId, setCutId] = React.useState<string | null>(null);
  const stratum = STRATA.find((s) => s.id === cutId) ?? null;

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
          <p className="text-label text-ink-3">CORE SAMPLE &middot; 06 STRATA</p>
          <p className="text-label text-ink-3">KQ-146</p>
        </div>

        <SectionCut
          strata={STRATA}
          onCut={setCutId}
          height={300}
          aria-label="Core sample section cut"
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          AT THE CUT &middot;{" "}
          <span className="text-cobalt-bright">
            {stratum ? stratum.label : "ABOVE GRADE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag the plane down - each stratum opens at the cut face.
        </p>
      </div>
    </div>
  );
}
