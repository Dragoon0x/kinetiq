"use client";

import * as React from "react";

import { FireflyField } from "@/registry/ui/firefly-field";

/**
 * FireflyField dressed as the KQ-137 meadow-dusk specimen: 48 fireflies
 * wander and blink at their own seeded depths inside a bezel plate, and
 * gather toward a held pointer or the keyboard Gather control. The status
 * line mirrors onGather, switching WANDERING/GATHERING as the hold starts
 * and stops.
 */
export function FireflyFieldDemo() {
  const [state, setState] = React.useState<"WANDERING" | "GATHERING">(
    "WANDERING",
  );

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span aria-hidden className="border-hairline absolute top-2 left-2 size-2 border-t border-l" />
        <span aria-hidden className="border-hairline absolute top-2 right-2 size-2 border-t border-r" />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">MEADOW DUSK &middot; 48 FLIES</p>
          <p className="text-label text-ink-3">KQ-137</p>
        </div>
        <FireflyField
          count={48}
          height={300}
          aria-label="Meadow dusk firefly field"
          onGather={(gathering) =>
            setState(gathering ? "GATHERING" : "WANDERING")
          }
        />
        <p role="status" className="border-hairline text-label text-ink-3 mt-3 border-t pt-3">
          SWARM &middot; <span className="text-cobalt-bright">{state}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">Press and hold - the fireflies gather to your hand.</p>
      </div>
    </div>
  );
}
