"use client";

import * as React from "react";

import { HorizonRise, type HorizonSection } from "@/registry/ui/horizon-rise";

function Card({
  index,
  title,
  lines,
}: {
  index: number;
  title: string;
  lines: [string, string];
}) {
  return (
    <div className="border-hairline bg-surface-2 rounded-3 border p-4">
      <p className="text-label text-ink-3">
        {String(index).padStart(2, "0")} · {title}
      </p>
      <div className="text-ink-2 mt-2 space-y-1 font-mono text-xs">
        <p>{lines[0]}</p>
        <p>{lines[1]}</p>
      </div>
    </div>
  );
}

const SECTIONS: HorizonSection[] = [
  {
    id: "outpost",
    node: (
      <Card
        index={1}
        title="OUTPOST"
        lines={["first light on the array", "all masts answering"]}
      />
    ),
  },
  {
    id: "relay",
    node: (
      <Card
        index={2}
        title="RELAY LINE"
        lines={["six towers over the ridge", "handoff clean at each"]}
      />
    ),
  },
  {
    id: "station",
    node: (
      <Card
        index={3}
        title="TERMINAL STATION"
        lines={["signal grounded and filed", "survey closed 18:40"]}
      />
    ),
  },
  {
    id: "archive",
    node: (
      <Card
        index={4}
        title="ARCHIVE"
        lines={["plates stored by serial", "index updated nightly"]}
      />
    ),
  },
];

export function HorizonRiseDemo() {
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
          <p className="text-label text-ink-3">SURVEY LINE · 04 STATIONS</p>
          <p className="text-label text-ink-3">KQ-070</p>
        </div>

        <HorizonRise
          sections={SECTIONS}
          height={250}
          once={false}
          aria-label="Survey stations"
        />

        <p className="text-ink-3 mt-3 text-center text-xs">
          Scroll the line - each station stands up over the horizon.
        </p>
      </div>
    </div>
  );
}
