"use client";

import * as React from "react";

import { GravityWell } from "@/registry/ui/gravity-well";

export function GravityWellDemo() {
  const [state, setState] = React.useState<"BOUND" | "SLUNG">("BOUND");

  const handleFling = (flung: boolean) => {
    setState(flung ? "SLUNG" : "BOUND");
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
          <p className="text-label text-ink-3">ORBIT FIELD &middot; 120 BODIES</p>
          <p className="text-label text-ink-3">KQ-139</p>
        </div>

        <GravityWell
          count={120}
          height={300}
          onFling={handleFling}
          aria-label="Gravity well orbit field of 120 bodies"
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          FIELD &middot; <span className="text-cobalt-bright">{state}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Draw the well around - fling fast to slingshot the bodies free.
        </p>
      </div>
    </div>
  );
}
