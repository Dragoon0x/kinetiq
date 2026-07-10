"use client";

import * as React from "react";

import { AltitudeList, type AltitudeItem } from "@/registry/ui/altitude-list";

const READINGS: AltitudeItem[] = [
  { id: "north", label: "MAST NORTH", value: 84, unit: "dB" },
  { id: "east", label: "MAST EAST", value: 41, unit: "dB" },
  { id: "south", label: "MAST SOUTH", value: 67, unit: "dB" },
  { id: "west", label: "MAST WEST", value: 22, unit: "dB" },
  { id: "relay", label: "RELAY CORE", value: 95, unit: "dB" },
];

export function AltitudeListDemo() {
  const [order, setOrder] = React.useState("HIGH FIRST");

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
          <p className="text-label text-ink-3">SIGNAL ALTITUDES · 05 MASTS</p>
          <p className="text-label text-ink-3">KQ-069</p>
        </div>

        <AltitudeList
          items={READINGS}
          aria-label="Mast signal readings"
          onSortChange={(sort) =>
            setOrder(
              sort === "value-desc"
                ? "HIGH FIRST"
                : sort === "value-asc"
                  ? "LOW FIRST"
                  : "BY NAME",
            )
          }
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-4 border-t pt-3"
        >
          ORDER · <span className="text-cobalt-bright">{order}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Stronger signals float higher - re-sort and they fly to their rank.
        </p>
      </div>
    </div>
  );
}
