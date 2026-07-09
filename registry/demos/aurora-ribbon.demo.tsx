"use client";

import { AuroraRibbon } from "@/registry/ui/aurora-ribbon";

/**
 * AuroraRibbon framed as a viewing plate: a bezel with corner registration
 * ticks and a mono spec header, the ribbons filling a recessed stage with the
 * caption floated bottom-left. Move the pointer over the stage and the bands
 * lean toward it. Reads on both the dark and light plate — the recessed stage
 * stays dark on either theme so the additive aurora always has room to bloom.
 */
export function AuroraRibbonDemo() {
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
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
            className={`border-hairline-strong absolute size-2.5 ${corner}`}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">AURORA · FIELD</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-049</span>
        </div>

        {/* Recessed stage: a fixed dark well so the glow reads on either plate. */}
        <div className="relative overflow-hidden rounded-2 bg-[oklch(0.145_0.02_258)]">
          <AuroraRibbon bands={4} height={320}>
            <div className="pointer-events-none flex h-full flex-col justify-end p-4">
              <p className="text-label text-[oklch(0.72_0.015_258)]">
                Move the pointer — the ribbons lean.
              </p>
            </div>
          </AuroraRibbon>
        </div>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Canvas 2D · additive glow · pauses offscreen
      </p>
    </div>
  );
}
