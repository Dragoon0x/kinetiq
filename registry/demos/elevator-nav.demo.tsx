"use client";

import * as React from "react";

import { ElevatorNav, type Floor } from "@/registry/ui/elevator-nav";

const FLOORS: Floor[] = [
  { id: "roof", label: "ROOF GARDEN" },
  { id: "studios", label: "STUDIOS" },
  { id: "offices", label: "OFFICES" },
  { id: "atrium", label: "ATRIUM" },
  { id: "lobby", label: "LOBBY" },
];

export function ElevatorNavDemo() {
  const [arrivedId, setArrivedId] = React.useState<string>("lobby");

  const arrived = FLOORS.find((floor) => floor.id === arrivedId);

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
          <p className="text-label text-ink-3">TOWER INDEX &middot; 05 FLOORS</p>
          <p className="text-label text-ink-3">KQ-090</p>
        </div>

        <ElevatorNav
          floors={FLOORS}
          defaultValue="lobby"
          height={300}
          aria-label="Tower floor navigation"
          onArrive={setArrivedId}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          ARRIVED &middot;{" "}
          <span className="text-cobalt-bright">
            {arrived ? arrived.label : "LOBBY"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Call a floor - the car rides and the doors part on arrival.
        </p>
      </div>
    </div>
  );
}
