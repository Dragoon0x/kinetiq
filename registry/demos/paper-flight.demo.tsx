"use client";

import * as React from "react";

import { PaperFlight } from "@/registry/ui/paper-flight";

/**
 * PaperFlight dressed as a bench instrument: a bezel plate with two corner
 * registration ticks and a mono spec header (serial KQ-140), the hangar
 * filling the stage, and a status line counting launches reported through
 * onLaunch. Click the sky (or press Launch) and a glider swoops across on a
 * bezier flight path.
 */
export function PaperFlightDemo() {
  const [count, setCount] = React.useState(0);

  const handleLaunch = () => {
    setCount((n) => n + 1);
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
          <p className="text-label text-ink-3">OPEN HANGAR &middot; PAPER FLEET</p>
          <p className="text-label text-ink-3">KQ-140</p>
        </div>
        <PaperFlight
          height={300}
          onLaunch={handleLaunch}
          className="rounded-2"
          aria-label="Paper glider hangar"
        />
        <p role="status" className="border-hairline text-label text-ink-3 mt-3 border-t pt-3">
          LAUNCHED &middot; <span className="text-cobalt-bright">{count}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Click the sky - a glider swoops across on its flight path.
        </p>
      </div>
    </div>
  );
}
