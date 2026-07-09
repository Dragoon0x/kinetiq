"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { RippleSurface } from "@/registry/ui/ripple-surface";

/**
 * RippleSurface dressed as a bench instrument: a bezel plate with corner
 * registration ticks and a mono spec header, the wave field filling the stage
 * with the caption floated bottom-left. Tap the plate and wavefronts propagate
 * and interfere where their crests cross.
 */
export function RippleSurfaceDemo() {
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
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
          <span className="text-label text-ink-2">WAVE TANK</span>
          <span className="text-label text-ink-3">CANVAS 2D</span>
        </div>

        <RippleSurface height={320} className="overflow-hidden rounded-2">
          <div className="flex h-full flex-col justify-end gap-1 p-4">
            <p className="text-label text-ink">RIPPLE · SURFACE</p>
            <p className="text-label text-ink-3">
              Tap the surface — wavefronts interfere.
            </p>
          </div>
        </RippleSurface>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Additive crests · interference where rings cross
      </p>
    </div>
  );
}
