"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { FacetCube } from "@/registry/ui/facet-cube";

/** Fixed specimen-bay roster — indexed by face, never random. */
const BAYS = [
  {
    name: "BAY A",
    glyph: "A",
    serial: "A-071-1",
    status: "SEALED",
    accent: "oklch(0.84 0.16 162)",
  },
  {
    name: "BAY B",
    glyph: "B",
    serial: "B-071-2",
    status: "ACTIVE",
    accent: "oklch(0.78 0.15 52)",
  },
  {
    name: "BAY C",
    glyph: "C",
    serial: "C-071-3",
    status: "STANDBY",
    accent: "oklch(0.72 0.15 258)",
  },
  {
    name: "BAY D",
    glyph: "D",
    serial: "D-071-4",
    status: "PURGED",
    accent: "oklch(0.74 0.19 350)",
  },
  {
    name: "BAY E",
    glyph: "E",
    serial: "E-071-5",
    status: "CHARGED",
    accent: "oklch(0.83 0.16 86)",
  },
  {
    name: "BAY F",
    glyph: "F",
    serial: "F-071-6",
    status: "IDLE",
    accent: "oklch(0.8 0.14 178)",
  },
] as const;

const BAY_LABELS = BAYS.map((bay) => bay.name);

/**
 * FacetCube as a bench instrument: six specimen bays on one rotatable cube,
 * framed by a bezel plate with corner ticks and the KQ-071 spec header. The
 * status line below reads whichever bay the cube settles on.
 */
export function FacetCubeDemo() {
  const [face, setFace] = React.useState(0);
  const bay = BAYS[face] ?? BAYS[0];

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

        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Specimen Bays &middot; 6 Faces
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-071</span>
        </div>

        {/* No overflow clipping here — mid-turn corners must paint freely. */}
        <div className="flex h-80 items-center justify-center">
          <FacetCube
            aria-label="Specimen bay cube"
            size={176}
            defaultFace={0}
            labels={BAY_LABELS}
            onFaceChange={setFace}
            faces={BAYS.map((entry) => (
              <BayFace key={entry.serial} bay={entry} />
            ))}
          />
        </div>

        <p
          role="status"
          className="border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Facing &middot; <span className="text-signal">{bay.name}</span>{" "}
          &middot; {bay.status}
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Drag the cube or use the arrow keys - it settles on the nearest face.
      </p>
    </div>
  );
}

type Bay = (typeof BAYS)[number];

/** One machined bay plate — chip, ghost glyph, serial, status. Nothing focusable. */
function BayFace({ bay }: { bay: Bay }) {
  return (
    <div className="flex h-full w-full flex-col justify-between p-4">
      <div className="flex items-start justify-between">
        <span className="text-label text-ink-2">{bay.name}</span>
        <span
          aria-hidden
          className="size-2.5 rounded-full ring-1 ring-hairline-strong"
          style={{ background: bay.accent }}
        />
      </div>

      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-8 w-1 rounded-full"
          style={{ background: bay.accent }}
        />
        <span
          aria-hidden
          className="font-mono text-3xl font-medium text-ink-3/50"
        >
          {bay.glyph}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3">
          {bay.serial}
        </span>
        <span className="text-label text-ink-2">{bay.status}</span>
      </div>
    </div>
  );
}
