"use client";

import * as React from "react";

import { LookRoom, type RoomHotspot } from "@/registry/ui/look-room";

/** The KQ-087 gallery roster — fixed order, front wall first. */
const HOTSPOTS: RoomHotspot[] = [
  {
    id: "atrium",
    label: "ATRIUM",
    wall: "front",
    at: 0.28,
    detail: "Glass ceiling, original 1971 skylight.",
  },
  {
    id: "reserve",
    label: "RESERVE",
    wall: "front",
    at: 0.72,
    detail: "Members-only, three rotating pieces.",
  },
  {
    id: "west-wing",
    label: "WEST WING",
    wall: "left",
    at: 0.5,
    detail: "Textiles and works on paper.",
  },
  {
    id: "east-wing",
    label: "EAST WING",
    wall: "right",
    at: 0.5,
    detail: "Sculpture, restored quarterly.",
  },
];

/**
 * LookRoom dressed as the KQ-087 gallery walk-through: four wing plaques on
 * a CSS-3D room behind a bezel plate with corner ticks and the mono spec
 * header. The status line mirrors onLook, naming whichever wing was last
 * activated.
 */
export function LookRoomDemo() {
  const [lookedId, setLookedId] = React.useState<string | null>(null);
  const spot = HOTSPOTS.find((hotspot) => hotspot.id === lookedId) ?? null;

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
          <p className="text-label text-ink-3">GALLERY ROOM &middot; 04 PLAQUES</p>
          <p className="text-label text-ink-3">KQ-087</p>
        </div>
        <LookRoom
          hotspots={HOTSPOTS}
          depth={260}
          height={290}
          aria-label="Gallery room"
          onLook={setLookedId}
        />
        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          LOOKING &middot;{" "}
          <span className="text-cobalt-bright">
            {spot ? spot.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Move the pointer to look around - focus a plaque to face it.
        </p>
      </div>
    </div>
  );
}
