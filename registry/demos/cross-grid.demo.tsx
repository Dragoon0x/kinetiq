"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CrossGrid,
  type CrossGridCell,
  type CrossGridColumn,
  type CrossGridRow,
} from "@/registry/ui/cross-grid";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "cosy",
    options: ["compact", "cosy"],
    names: { compact: "Compact", cosy: "Cosy" },
  },
  followLabels: { kind: "toggle", label: "Follow labels", default: true },
  highlight: {
    kind: "choice",
    label: "Highlight",
    default: "bar",
    options: ["bar", "glow"],
    names: { bar: "Bar", glow: "Glow" },
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 640,
    min: 200,
    max: 1000,
    step: 40,
  },
});

const DAYS: CrossGridColumn[] = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
];

const DEPOTS: CrossGridRow[] = [
  { id: "coldbrook", label: "Coldbrook", values: [412, 388, 455, 431, 502] },
  { id: "basin-yard", label: "Basin Yard", values: [296, 318, 341, 305, 377] },
  { id: "fern-hill", label: "Fern Hill", values: [184, 205, 199, 226, 248] },
  { id: "gauge-row", label: "Gauge Row", values: [367, 402, 412, 389, 451] },
  { id: "waylight", label: "Waylight", values: [523, 498, 547, 561, 604] },
];

const parcels = new Intl.NumberFormat("en-US");

/**
 * Fernworks parcels shipped this week, by depot and weekday. The crosshair
 * reads out the pointed cell in the status line.
 */
export function CrossGridDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [cell, setCell] = React.useState<CrossGridCell | null>(null);
  const depot = DEPOTS.find((d) => d.id === cell?.row);
  const dayIndex = DAYS.findIndex((d) => d.id === cell?.column);
  const value = depot && dayIndex >= 0 ? depot.values[dayIndex] : undefined;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <CrossGrid
        label="Fernworks parcels shipped by depot and weekday"
        corner="Depot"
        columns={DAYS}
        rows={DEPOTS}
        onActiveChange={setCell}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {depot && value !== undefined ? (
            <>
              <span className="text-signal">
                {depot.label} · {DAYS[dayIndex]?.label}
              </span>
              {` · ${parcels.format(value)} ${value === 1 ? "parcel" : "parcels"}`}
            </>
          ) : (
            "point at a cell or use the arrow keys"
          )}
        </p>
      ) : null}
    </div>
  );
}
