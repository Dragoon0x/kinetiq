"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { BillboardRun, type Billboard } from "@/registry/ui/billboard-run";

/** The approach-road copy — four claims the wing makes, passed in order. */
const BOARDS: Billboard[] = [
  {
    id: "calibrated",
    headline: "CALIBRATED",
    deck: "five springs, one language",
  },
  {
    id: "machined",
    headline: "MACHINED",
    deck: "hairlines and mono serials",
  },
  {
    id: "accountable",
    headline: "ACCOUNTABLE",
    deck: "every state announced",
  },
  {
    id: "yours",
    headline: "YOURS",
    deck: "copy the source, own it",
  },
];

/**
 * BillboardRun dressed as the KQ-105 approach road: four claims on roadside
 * boards behind a bezel plate with corner ticks and a mono spec header. The
 * status line mirrors onPass, counting boards as they sweep by the camera.
 */
export function BillboardRunDemo() {
  const [passed, setPassed] = React.useState(0);

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
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

        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-label text-ink-2">
            APPROACH ROAD · {String(BOARDS.length).padStart(2, "0")} BOARDS
          </p>
          <p className="text-label text-ink-3 tabular-nums">KQ-105</p>
        </div>

        <BillboardRun
          boards={BOARDS}
          height={260}
          aria-label="Approach road"
          onPass={(index) => setPassed(index + 1)}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          PASSED ·{" "}
          <span className="text-cobalt-bright tabular-nums">
            {String(passed).padStart(2, "0")}/
            {String(BOARDS.length).padStart(2, "0")}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Drive the road - each board grows, banks, and sweeps by.
        </p>
      </div>
    </div>
  );
}
