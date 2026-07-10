"use client";

import * as React from "react";

import { SwingDoor } from "@/registry/ui/swing-door";
import { cn } from "@/registry/lib/utils";

/** Fixed stores manifest behind the hatch — labels and counts, never random. */
const SHELF = [
  { label: "Coil Stock", count: "14" },
  { label: "Damper Sets", count: "06" },
  { label: "Seal Rings", count: "22" },
] as const;

/**
 * SwingDoor as the KQ-151 stores hatchway: one hinged door over the parts
 * shelf, the status line mirroring every swing and slam.
 */
export function SwingDoorDemo() {
  const [open, setOpen] = React.useState(false);

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
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Stores Hatchway</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-151</span>
        </div>

        <SwingDoor
          aria-label="Stores hatchway"
          height={230}
          onOpenChange={setOpen}
        >
          {/* The shelf readout waiting in the doorway. */}
          <div className="flex h-full flex-col justify-center gap-3 px-4">
            {SHELF.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-2 border-b border-hairline pb-2"
              >
                <span className="font-mono text-[10px] tracking-[0.12em] text-ink-2 uppercase">
                  {row.label}
                </span>
                <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 tabular-nums">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </SwingDoor>

        <p
          role="status"
          className="mt-4 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Door &middot;{" "}
          <span className="text-signal">{open ? "Open" : "Shut"}</span>
        </p>

        <p className="mt-3 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-151 &middot; Swing Door &middot; Swg 104&deg; &middot; Detent
          70&deg; &middot; P 800 &middot; &zeta; 0.98
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Drag the door past the detent - short pulls slam it home.
      </p>
    </div>
  );
}
