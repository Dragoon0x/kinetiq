"use client";

import * as React from "react";

import { Drawbridge } from "@/registry/ui/drawbridge";

export function DrawbridgeDemo() {
  const [state, setState] = React.useState("RAISED");

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
          <p className="text-label text-ink-3">CANAL CROSSING</p>
          <p className="text-label text-ink-3">KQ-160</p>
        </div>

        <Drawbridge
          height={240}
          lowerLabel="LOWER THE SPAN"
          raiseLabel="RAISE THE SPAN"
          onBridgedChange={(b) => setState(b ? "BRIDGED" : "RAISED")}
          near={
            <div className="text-ink-2 space-y-0.5 font-mono text-[10px]">
              <p>DISPATCH POST</p>
              <p className="text-ink-3">two couriers waiting</p>
            </div>
          }
          far={
            <div className="text-ink-2 space-y-0.5 font-mono text-[10px]">
              <p>RELAY STATION</p>
              <p className="text-ink-3">signals filed hourly</p>
            </div>
          }
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          SPAN · <span className="text-cobalt-bright">{state}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Lower the span - the chains pay out and a runner proves the crossing.
        </p>
      </div>
    </div>
  );
}
