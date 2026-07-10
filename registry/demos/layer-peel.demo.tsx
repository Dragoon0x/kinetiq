"use client";

import * as React from "react";

import { LayerPeel, type PeelLayer } from "@/registry/ui/layer-peel";

const LAYERS: PeelLayer[] = [
  {
    id: "brief",
    label: "DISPATCH BRIEF",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>routing window opens 06:00</p>
        <p>two couriers on standby</p>
      </div>
    ),
  },
  {
    id: "manifest",
    label: "CARGO MANIFEST",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>14 crates · 3 fragile</p>
        <p>mass 812kg · sealed</p>
      </div>
    ),
  },
  {
    id: "clearance",
    label: "CLEARANCE SHEET",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>dock 4 assigned</p>
        <p>countersigned · valid 24h</p>
      </div>
    ),
  },
];

export function LayerPeelDemo() {
  const [peeled, setPeeled] = React.useState(0);

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
          <p className="text-label text-ink-3">DISPATCH STACK · 03 SHEETS</p>
          <p className="text-label text-ink-3">KQ-066</p>
        </div>

        <LayerPeel
          layers={LAYERS}
          height={210}
          onPeel={() => setPeeled((n) => n + 1)}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          SHEETS PEELED ·{" "}
          <span className="text-cobalt-bright">
            {String(peeled).padStart(2, "0")}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drag the grip left past the detent - short pulls recoil shut.
        </p>
      </div>
    </div>
  );
}
