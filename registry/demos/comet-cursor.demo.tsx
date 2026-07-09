"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { CometCursor } from "@/registry/ui/comet-cursor";

/**
 * CometCursor mounted as a bench instrument: a bezel plate with corner
 * registration ticks framing the stage, the comet filling it edge to edge with
 * a mono caption floated bottom-left. Move the pointer across the plate and a
 * luminous head drags a tapering tail that thickens with speed and collapses
 * when you stop. The serial is stamped by the specimen plate around it, so the
 * demo never prints its own.
 */
export function CometCursorDemo() {
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

        <CometCursor
          trail={32}
          height={320}
          className="bg-surface-1 overflow-hidden rounded-2"
        >
          <div className="pointer-events-none flex h-full flex-col justify-between p-4">
            <span className="text-label text-ink-2">COMET · TRACE</span>
            <p className="text-label text-ink-3">
              Move the pointer — the comet chases.
            </p>
          </div>
        </CometCursor>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Luminous head · tail thickens with speed, collapses at rest
      </p>
    </div>
  );
}
