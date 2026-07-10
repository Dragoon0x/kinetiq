"use client";

import * as React from "react";

import { PulleyLift, type Floor } from "@/registry/ui/pulley-lift";
import { cn } from "@/registry/lib/utils";

/** One cargo readout row on the car plate — mono, deterministic. */
function CargoRow({ text }: { text: string }) {
  return (
    <p className="font-mono text-[10px] leading-snug tracking-[0.08em] text-ink-3 uppercase tabular-nums">
      {text}
    </p>
  );
}

/** The three stops KQ-156 serves, ground first. */
const FLOORS: Floor[] = [
  {
    id: "ground",
    label: "Ground",
    content: (
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] leading-none tracking-[0.12em] text-ink uppercase">
          Intake
        </p>
        <CargoRow text={"Pallets · 06"} />
        <CargoRow text={"Gate · Open"} />
      </div>
    ),
  },
  {
    id: "mezzanine",
    label: "Mezzanine",
    content: (
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] leading-none tracking-[0.12em] text-ink uppercase">
          Sorting
        </p>
        <CargoRow text={"Bins · 18"} />
        <CargoRow text={"Belt · Live"} />
      </div>
    ),
  },
  {
    id: "loft",
    label: "Loft",
    content: (
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] leading-none tracking-[0.12em] text-ink uppercase">
          Archive
        </p>
        <CargoRow text={"Ledgers · 41"} />
        <CargoRow text={"Seal · 1987"} />
      </div>
    ),
  },
];

/**
 * PulleyLift dressed as the KQ-156 stores lift: a three-stop goods elevator
 * with the intake dock at ground, sorting on the mezzanine and the archive in
 * the loft. Haul any of the rig's three grab surfaces and release — the
 * counterweight settles the car at the nearest floor and the AT readout
 * mirrors every arrival.
 */
export function PulleyLiftDemo() {
  // KQ-156 boots at the ground dock; the readout only moves on settle.
  const [at, setAt] = React.useState<string>(FLOORS[0]?.label ?? "Ground");

  const handleFloorChange = (id: string) => {
    setAt(FLOORS.find((f) => f.id === id)?.label ?? id);
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
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
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Stores Lift</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-156</span>
        </div>

        <div className="flex flex-col gap-3">
          <PulleyLift
            floors={FLOORS}
            height={270}
            onFloorChange={handleFloorChange}
            aria-label="Stores lift"
          />

          {/* Settled readout — AT lands with the car, never per pixel. */}
          <p
            role="status"
            className="border-t border-hairline pt-3 text-center text-label text-ink-3 tabular-nums"
          >
            At &middot;{" "}
            <span className="font-mono text-sm text-signal">{at}</span>
          </p>
        </div>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-156 &middot; Pulley Lift &middot; 03 Floors &middot; Rope 1:1
          &middot; &zeta; 0.53
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Haul the rope and let go - the counterweight lands the car.
      </p>
    </div>
  );
}
