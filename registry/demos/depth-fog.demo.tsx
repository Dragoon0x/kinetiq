"use client";

import * as React from "react";

import { DepthFog } from "@/registry/ui/depth-fog";

function MoorBed() {
  return (
    <div className="bg-surface-1 flex h-full flex-col justify-center gap-2 p-5">
      <p className="text-label text-ink-3">MOOR SURVEY &middot; SITE 07</p>
      <p className="text-ink font-mono text-2xl tracking-wide">61.2N 4.8W</p>
      <div className="text-ink-3 space-y-0.5 font-mono text-[10px]">
        <p>depth 14.6m &middot; silt bed</p>
        <p>marker buoys 3 &middot; anchor set</p>
        <p>last dive log 09:41</p>
      </div>
    </div>
  );
}

export function DepthFogDemo() {
  const [clearing, setClearing] = React.useState(false);

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
          <p className="text-label text-ink-3">MOOR SURVEY &middot; DRIFTING FOG</p>
          <p className="text-label text-ink-3">KQ-132</p>
        </div>

        <DepthFog
          height={300}
          onClear={setClearing}
          aria-label="Fogged moor survey panel"
        >
          <MoorBed />
        </DepthFog>

        <p role="status" className="border-hairline text-label text-ink-3 mt-3 border-t pt-3">
          VISIBILITY &middot;{" "}
          <span className="text-cobalt-bright">{clearing ? "OPEN" : "FOGGED"}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Sweep the fog aside to read the moor beneath.
        </p>
      </div>
    </div>
  );
}
