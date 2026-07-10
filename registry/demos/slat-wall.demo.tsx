"use client";

import * as React from "react";

import { SlatWall } from "@/registry/ui/slat-wall";

function RosterFace() {
  const rows = ["VANE", "COIL", "LATTICE", "ROTOR"];
  return (
    <span className="bg-surface-1 flex h-full flex-col justify-between p-4">
      <span className="text-label text-ink-3 block">CREW ROSTER</span>
      <span className="block space-y-1.5">
        {rows.map((name, i) => (
          <span key={name} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: `oklch(0.72 0.14 ${(i * 90 + 40) % 360})` }}
            />
            <span className="text-ink-2 font-mono text-xs">
              OP-{String(i + 1).padStart(2, "0")} {name}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

function ShiftFace() {
  const rows = ["06:00-14:00", "14:00-22:00", "22:00-06:00", "RESERVE"];
  return (
    <span
      className="flex h-full flex-col justify-between p-4"
      style={{ background: "oklch(0.2 0.03 258)" }}
    >
      <span className="text-label block text-[oklch(0.72_0.12_258)]">
        SHIFT BOARD
      </span>
      <span className="block space-y-1.5">
        {rows.map((slot, i) => (
          <span key={slot} className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[oklch(0.6_0.08_258)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="font-mono text-xs text-[oklch(0.86_0.06_258)]">
              {slot}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

export function SlatWallDemo() {
  const [face, setFace] = React.useState("ROSTER");

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
          <p className="text-label text-ink-3">DUTY LOUVERS · 07 SLATS</p>
          <p className="text-label text-ink-3">KQ-093</p>
        </div>

        <SlatWall
          a={<RosterFace />}
          b={<ShiftFace />}
          slats={7}
          height={200}
          aria-label="Roster and shift board"
          onSideChange={(side) => setFace(side === "a" ? "ROSTER" : "SHIFTS")}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          FACING · <span className="text-cobalt-bright">{face}</span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Press the wall - seven louvers carry the swap in a wave.
        </p>
      </div>
    </div>
  );
}
