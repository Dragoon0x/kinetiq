"use client";

import * as React from "react";

import { SunShaft } from "@/registry/ui/sun-shaft";

const MOTES = 70;

/**
 * KQ-136: the sun shaft in its atrium bezel. Move the pointer through the
 * beam and the dust motes swirl in a trailing eddy, easing back to their
 * lazy drift once you leave — the status line tracks live via onStir.
 */
export function SunShaftDemo() {
  const [state, setState] = React.useState<"STILL" | "STIRRED">("STILL");

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
          <p className="text-label text-ink-3">ATRIUM LIGHT &middot; 70 MOTES</p>
          <p className="text-label text-ink-3">KQ-136</p>
        </div>
        <SunShaft
          count={MOTES}
          height={300}
          aria-label="Sun shaft"
          onStir={(stirring) => setState(stirring ? "STIRRED" : "STILL")}
        />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          AIR &middot; <span className="text-cobalt-bright">{state}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Move through the beam - the motes swirl in your wake.
        </p>
      </div>
    </div>
  );
}
