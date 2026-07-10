"use client";

import * as React from "react";

import { CurtainLift } from "@/registry/ui/curtain-lift";

function Stage() {
  return (
    <div className="bg-surface-1 flex h-full flex-col items-center justify-center gap-2 p-4">
      <p className="text-label text-ink-3">EXHIBIT 12</p>
      <p className="text-ink font-mono text-lg tracking-wide">
        THE CALIBRATION SET
      </p>
      <p className="text-ink-3 font-mono text-[10px]">
        five springs · one language
      </p>
    </div>
  );
}

export function CurtainLiftDemo() {
  const [state, setState] = React.useState("LOWERED");

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
          <p className="text-label text-ink-3">GALLERY CURTAIN · 14 FOLDS</p>
          <p className="text-label text-ink-3">KQ-096</p>
        </div>

        <CurtainLift
          height={200}
          openLabel="RAISE CURTAIN"
          closeLabel="LOWER CURTAIN"
          onOpenChange={(open) => setState(open ? "RAISED" : "LOWERED")}
        >
          <Stage />
        </CurtainLift>

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          CURTAIN · <span className="text-cobalt-bright">{state}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Raise the rig - the hem travels as a wave from the center.
        </p>
      </div>
    </div>
  );
}
