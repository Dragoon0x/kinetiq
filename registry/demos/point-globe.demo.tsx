"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PointGlobe } from "@/registry/ui/point-globe";

const NODES = 520;

/**
 * PointGlobe dressed as a bench instrument: a bezel plate with corner
 * registration ticks and a mono spec header, the dotted planet filling the
 * stage with its orbital caption floated bottom-left. Grab the globe and spin
 * it — it carries angular momentum that decays back to the idle drift.
 */
export function PointGlobeDemo() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
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

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">ORBITAL · {NODES} NODES</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-050</span>
        </div>

        <PointGlobe
          points={NODES}
          height={340}
          className="overflow-hidden rounded-2"
        >
          <div className="flex h-full flex-col justify-end p-4">
            <p className="text-label text-ink-3">
              Drag to spin — momentum carries.
            </p>
          </div>
        </PointGlobe>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Fibonacci lattice · near cap brightens, far hemisphere dims
      </p>
    </div>
  );
}
