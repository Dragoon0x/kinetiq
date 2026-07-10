"use client";

import * as React from "react";

import { PivotGrid, type PivotCard } from "@/registry/ui/pivot-grid";

/** The KQ-089 ward roster — fixed order, three per row. */
const CARDS: PivotCard[] = [
  {
    id: "archive",
    label: "ARCHIVE",
    node: "Records, sealed",
    room: "Floor-to-ceiling shelving - every case folder since 1948.",
  },
  {
    id: "foundry",
    label: "FOUNDRY",
    node: "Instruments, cast",
    room: "The old casting floor - surgical steel, poured on site.",
  },
  {
    id: "annex",
    label: "ANNEX",
    node: "Overflow beds",
    room: "Twelve beds, added during the 1962 wing expansion.",
  },
  {
    id: "cistern",
    label: "CISTERN",
    node: "Water, reserve",
    room: "Gravity-fed reserve tank - three days of ward supply.",
  },
  {
    id: "signal",
    label: "SIGNAL",
    node: "Comms, relay",
    room: "Paging relay and the ward radio set - the only one working.",
  },
  {
    id: "vault",
    label: "VAULT",
    node: "Meds, locked",
    room: "Controlled stock behind a double lock - two keys required.",
  },
];

/**
 * PivotGrid dressed as the KQ-089 ward map: six rooms on a card wall inside
 * a bezel plate with corner ticks and the mono spec header. The status line
 * mirrors onEnter, naming whichever room was last turned into.
 */
export function PivotGridDemo() {
  const [enteredId, setEnteredId] = React.useState<string | null>(null);
  const card = CARDS.find((c) => c.id === enteredId) ?? null;

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
          <p className="text-label text-ink-3">WARD MAP &middot; 06 ROOMS</p>
          <p className="text-label text-ink-3">KQ-089</p>
        </div>
        <PivotGrid
          cards={CARDS}
          columns={3}
          height={300}
          aria-label="Ward map"
          onEnter={setEnteredId}
        />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          INSIDE &middot;{" "}
          <span className="text-cobalt-bright">
            {card ? card.label : "THE WALL"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Click a room to turn the corner into it - Escape turns back.
        </p>
      </div>
    </div>
  );
}
