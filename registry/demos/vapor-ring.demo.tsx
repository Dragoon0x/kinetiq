"use client";

import * as React from "react";

import { VaporRing } from "@/registry/ui/vapor-ring";

/**
 * VaporRing dressed as a bench instrument: a bezel plate with registration
 * ticks, a mono spec header, and a puff counter. The count is plain
 * event-driven state, incremented once per onPuff — never a per-frame write.
 */
export function VaporRingDemo() {
  const [count, setCount] = React.useState(0);

  const handlePuff = () => {
    setCount((n) => n + 1);
  };

  return (
    <div className="w-full max-w-lg">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        <span
          aria-hidden
          className="absolute top-2 left-2 size-2 border-t border-l border-hairline"
        />
        <span
          aria-hidden
          className="absolute top-2 right-2 size-2 border-t border-r border-hairline"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">STILL AIR &middot; VAPOR</p>
          <p className="text-label text-ink-3">KQ-138</p>
        </div>
        <VaporRing
          height={300}
          onPuff={handlePuff}
          aria-label="Vapor ring stage"
        />
        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-label text-ink-3"
        >
          PUFFS &middot; <span className="text-cobalt-bright">{count}</span>
        </p>
        <p className="mt-2 text-center text-xs text-ink-3">
          Click the air - a ring of vapor rolls out and fades.
        </p>
      </div>
    </div>
  );
}
