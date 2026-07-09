"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { IronFilings } from "@/registry/ui/iron-filings";

/**
 * IronFilings dressed as a bench instrument: a bezel plate with corner
 * registration ticks and a mono spec header, the field filling the stage with
 * a caption floated bottom-left. Move the pointer over the plate and the
 * lattice swings to point at it like filings around a magnetic pole.
 */
export function IronFilingsDemo() {
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
          <span className="text-label text-ink-2">MAGNETIC FIELD</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-046</span>
        </div>

        <IronFilings
          spacing={26}
          height={320}
          className="overflow-hidden rounded-2"
        >
          <div className="pointer-events-none flex h-full flex-col justify-end p-4">
            <p className="text-label text-ink-3">
              Move the pointer — the filings align.
            </p>
          </div>
        </IronFilings>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Radial alignment · dashes point along B toward the pole
      </p>
    </div>
  );
}
