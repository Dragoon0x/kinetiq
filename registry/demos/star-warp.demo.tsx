"use client";

import * as React from "react";

import { StarWarp } from "@/registry/ui/star-warp";

export function StarWarpDemo() {
  const [warping, setWarping] = React.useState(false);

  const handleWarp = (next: boolean) => {
    setWarping(next);
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
          <p className="text-label text-ink-3">JUMP DRIVE &middot; 180 STARS</p>
          <p className="text-label text-ink-3">KQ-131</p>
        </div>

        <StarWarp
          height={300}
          onWarp={handleWarp}
          aria-label="Star warp jump drive. Hold to jump to warp, move to steer the field."
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          DRIVE &middot;{" "}
          <span className="text-cobalt-bright">{warping ? "WARP" : "CRUISE"}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Hold to jump to warp - move to steer the field.
        </p>
      </div>
    </div>
  );
}
