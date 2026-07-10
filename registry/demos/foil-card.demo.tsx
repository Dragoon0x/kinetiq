"use client";

import * as React from "react";

import { FoilCard } from "@/registry/ui/foil-card";

export function FoilCardDemo() {
  const [stamps, setStamps] = React.useState(0);

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
          <p className="text-label text-ink-3">OPERATOR PASS · FOIL</p>
          <p className="text-label text-ink-3">KQ-092</p>
        </div>

        <FoilCard
          aria-label="Operator pass — press to stamp"
          onStamp={() => setStamps((n) => n + 1)}
          emblem={
            <span className="border-hairline-strong flex size-8 items-center justify-center rounded-full border font-mono text-[10px]">
              KQ
            </span>
          }
        >
          <span className="block">
            <span className="text-label text-ink-3 block">
              MOTION LABORATORY
            </span>
            <span className="text-ink mt-3 block font-mono text-lg tracking-wide">
              OP-2141-K
            </span>
            <span className="text-ink-3 mt-1 block font-mono text-[10px]">
              CLEARANCE B · ALL WINGS
            </span>
          </span>
        </FoilCard>

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          STAMPS ·{" "}
          <span className="text-cobalt-bright">
            {String(stamps).padStart(2, "0")}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Sweep the pass - only the light moves; press to stamp it.
        </p>
      </div>
    </div>
  );
}
