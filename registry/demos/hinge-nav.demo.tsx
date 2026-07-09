"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { HingeNav, type HingeDoor } from "@/registry/ui/hinge-nav";

/** Fixed bay directory — one door per frame edge, mono hints, never random. */
const DOORS: HingeDoor[] = [
  {
    side: "left",
    label: "SYSTEMS",
    items: [
      { id: "dampers", label: "Dampers", hint: "ζ 0.83" },
      { id: "springs", label: "Springs", hint: "5 SET" },
      { id: "rails", label: "Rails", hint: "2 AXIS" },
    ],
  },
  {
    side: "right",
    label: "ARCHIVE",
    items: [
      { id: "logs", label: "Logs", hint: "48 HR" },
      { id: "manifests", label: "Manifests", hint: "REV B" },
    ],
  },
];

/** The bay's resting readout — a 2×2 grid of fixed mono stats. */
const READOUT = [
  { label: "Damping", value: "ζ 0.83" },
  { label: "Stiffness", value: "640 N/M" },
  { label: "Mass", value: "1.00 KG" },
  { label: "Settle", value: "300 MS" },
] as const;

/** Resolve a selection into the status line's SIDE/Label reading. */
function routedFor(side: "left" | "right", itemId: string): string {
  const door = DOORS.find((candidate) => candidate.side === side);
  const item = door?.items.find((candidate) => candidate.id === itemId);
  return `${side.toUpperCase()}/${item?.label ?? itemId}`;
}

/**
 * HingeNav as the KQ-120 control bay: a resting readout grid with the
 * SYSTEMS door hinged on the left frame edge and the ARCHIVE door on the
 * right. The status line mirrors every routed selection.
 */
export function HingeNavDemo() {
  const [routed, setRouted] = React.useState<string | null>(null);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Control Bay &middot; 2 Doors
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-120</span>
        </div>

        <HingeNav
          doors={DOORS}
          height={260}
          onSelect={(side, id) => setRouted(routedFor(side, id))}
        >
          <div className="grid h-full grid-cols-2 gap-2 p-3">
            {READOUT.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col justify-between rounded-2 border border-hairline bg-surface-1 p-2.5"
              >
                <span className="text-label text-ink-3">{stat.label}</span>
                <span className="font-mono text-sm text-ink tabular-nums">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        </HingeNav>

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Routed &middot; <span className="text-signal">{routed ?? "—"}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Pull a side tab - the door swings in on its hinge.
      </p>
    </div>
  );
}
