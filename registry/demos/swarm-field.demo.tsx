"use client";

import { SwarmField } from "@/registry/ui/swarm-field";

const UNITS = 76;

export function SwarmFieldDemo() {
  return (
    <div className="w-full max-w-xl">
      <div className="overflow-hidden rounded-4 border border-border bg-card">
        <SwarmField count={UNITS} height={320}>
          <div className="flex h-full flex-col justify-between p-6">
            <p className="text-label text-ink-3">SWARM · {UNITS} UNITS</p>
            <p className="max-w-[28ch] text-sm text-muted-foreground">
              Move the pointer — the flock scatters.
            </p>
          </div>
        </SwarmField>
      </div>
      <p className="mt-3 text-center text-label text-ink-3">
        Canvas 2D · Spatial hash · Pauses offscreen
      </p>
    </div>
  );
}
