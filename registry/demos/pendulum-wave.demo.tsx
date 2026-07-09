"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PendulumWave } from "@/registry/ui/pendulum-wave";

const COUNT = 12;

/**
 * PendulumWave dressed as a bench instrument: a bezel plate with corner ticks,
 * a mono spec header and the harmonic caption. The component carries its own
 * Restart / Play controls, so re-alignment and pausing are wired through it.
 */
export function PendulumWaveDemo() {
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
          <span className="text-label text-ink-2">HARMONIC · {COUNT} BOBS</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-044</span>
        </div>

        <PendulumWave
          count={COUNT}
          amplitude={26}
          cycleSeconds={30}
          baseOscillations={20}
          height={240}
          aria-label="Harmonic pendulum wave"
        />
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        θᵢ = A·cos(2πt / Tᵢ) · realigns every 30s
      </p>
    </div>
  );
}
