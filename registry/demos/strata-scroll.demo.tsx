"use client";

import * as React from "react";

import { StrataScroll, type Stratum } from "@/registry/ui/strata-scroll";

const STRATA: Stratum[] = [
  {
    id: "crust",
    label: "SURFACE CRUST",
    note: "transition: abrupt, 0.2m of oxidized fines",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>0.0m - 1.2m · loose aggregate</p>
        <p>moisture 04% · bearing poor</p>
      </div>
    ),
  },
  {
    id: "fill",
    label: "COMPACTED FILL",
    note: "transition: gradual, 0.4m interbedded lenses",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>1.2m - 4.6m · engineered fill</p>
        <p>moisture 09% · bearing fair</p>
      </div>
    ),
  },
  {
    id: "water",
    label: "WATER TABLE",
    note: "transition: sharp, saturated contact",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>4.6m - 6.1m · saturated sands</p>
        <p>inflow steady · casing advised</p>
      </div>
    ),
  },
  {
    id: "rock",
    label: "PARENT ROCK",
    content: (
      <div className="text-ink-2 space-y-1 font-mono text-xs">
        <p>6.1m+ · competent basalt</p>
        <p>refusal at 7.8m · core recovered</p>
      </div>
    ),
  },
];

export function StrataScrollDemo() {
  const [reading, setReading] = React.useState("SURFACE CRUST");

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
          <p className="text-label text-ink-3">BORE LOG · 04 STRATA</p>
          <p className="text-label text-ink-3">KQ-063</p>
        </div>

        <StrataScroll
          strata={STRATA}
          height={300}
          aria-label="Bore log strata"
          onFocusChange={(id) => {
            const stratum = STRATA.find((s) => s.id === id);
            if (stratum) setReading(stratum.label);
          }}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          READING · <span className="text-cobalt-bright">{reading}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Scroll the bore - seams open as you pass between layers.
        </p>
      </div>
    </div>
  );
}
