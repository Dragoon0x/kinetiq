"use client";

import { cn } from "@/registry/lib/utils";
import { PunchType } from "@/registry/ui/punch-type";

/**
 * PunchType dressed as the KQ-109 stencil plate: a bezel with corner
 * registration ticks, the word PUNCH die-cut through the surface at display
 * size, and the built-in vista sweeping behind the letterforms as the
 * pointer crosses the plate.
 */
export function PunchTypeDemo() {
  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4 sm:p-5">
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
          <p className="text-label text-ink-2">STENCIL PLATE</p>
          <p className="text-label text-ink-3 tabular-nums">KQ-109</p>
        </div>

        <PunchType
          text="PUNCH"
          aria-label="Stencil plate: the word PUNCH punched through the surface"
        />

        <p className="text-ink-3 mt-3 font-mono text-[10px] tracking-[0.15em] uppercase">
          PLATE 109 &middot; DIE-CUT
        </p>

        <p className="text-ink-3 mt-3 text-center text-xs">
          Sweep the plate - the vista moves behind the letterforms.
        </p>
      </div>
    </div>
  );
}
