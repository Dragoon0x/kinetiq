"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { HallwayMenu, type Hallway } from "@/registry/ui/hallway-menu";

/** Fixed wing directory — three halls, short mono hints, never random. */
const HALLS: Hallway[] = [
  {
    id: "instruments",
    label: "INSTRUMENTS",
    items: [
      { id: "dials", label: "Dials", hint: "R 96" },
      { id: "cubes", label: "Cubes", hint: "STEP 90" },
      { id: "decks", label: "Decks", hint: "5 CARDS" },
      { id: "wheels", label: "Wheels", hint: "ζ 0.98" },
    ],
  },
  {
    id: "materials",
    label: "MATERIALS",
    items: [
      { id: "glass", label: "Glass", hint: "IOR 1.5" },
      { id: "foil", label: "Foil", hint: "0.2 MM" },
      { id: "cloth", label: "Cloth", hint: "TWILL" },
    ],
  },
  {
    id: "archive",
    label: "ARCHIVE",
    items: [
      { id: "serials", label: "Serials", hint: "KQ-001+" },
      { id: "blueprints", label: "Blueprints", hint: "A3" },
      { id: "manuals", label: "Manuals", hint: "REV C" },
    ],
  },
];

/** Resolve a selection into the status line's HALL/Door reading. */
function enteredFor(hallwayId: string, itemId: string): string {
  const hall = HALLS.find((candidate) => candidate.id === hallwayId);
  const door = hall?.items.find((candidate) => candidate.id === itemId);
  return `${hall?.label ?? hallwayId}/${door?.label ?? itemId}`;
}

/**
 * HallwayMenu as the KQ-116 wing directory: three halls on the rail, each
 * stop looking down its own corridor over a reserved standby plate. The
 * status line mirrors every door entered.
 */
export function HallwayMenuDemo() {
  const [entered, setEntered] = React.useState<string | null>(null);

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
            Wing Directory &middot; 3 Halls
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-116</span>
        </div>

        <HallwayMenu
          hallways={HALLS}
          aria-label="Wing directory"
          onSelect={(hallwayId, itemId) =>
            setEntered(enteredFor(hallwayId, itemId))
          }
        />

        {/* Standby plate — the corridor overlay lands exactly on this
            reservation (mt-2 + 220px matches the default corridorHeight),
            so the bezel never pumps when a hall opens. */}
        <div
          aria-hidden
          className="mt-2 flex h-[220px] items-center justify-center rounded-3 border border-dashed border-hairline"
        >
          <span className="text-label text-ink-3">No hall in view</span>
        </div>

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Entered &middot;{" "}
          <span className="text-signal">{entered ?? "—"}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Sweep the rail - each stop looks down its own hallway.
      </p>
    </div>
  );
}
