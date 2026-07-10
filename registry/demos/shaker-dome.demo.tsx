"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { ShakerDome } from "@/registry/ui/shaker-dome";

/**
 * ShakerDome as a bench keepsake: a bezel plate with corner registration
 * ticks and a mono spec header, the default serial monument under the
 * glass, and a stir counter fed by presses anywhere on the keepsake —
 * dome grabs and STIR clicks alike.
 */
export function ShakerDomeDemo() {
  const [stirs, setStirs] = React.useState(0);

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "top-2 left-2 border-t border-l",
            "top-2 right-2 border-t border-r",
            "bottom-2 left-2 border-b border-l",
            "right-2 bottom-2 border-r border-b",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-label text-ink-3">KEEPSAKE DOME</p>
          <div className="flex items-baseline gap-2">
            <span className="border-hairline text-ink-3 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums">
              Stirs · {String(stirs).padStart(2, "0")}
            </span>
            <span className="text-label text-ink-3 tabular-nums">KQ-124</span>
          </div>
        </div>

        <div onPointerDown={() => setStirs((n) => n + 1)}>
          <ShakerDome aria-label="Keepsake shaker dome" />
        </div>

        <p className="border-hairline text-ink-3 mt-3 border-t pt-3 text-center text-xs">
          Shake the dome or press stir - the flakes take the long way down.
        </p>
      </div>
    </div>
  );
}
