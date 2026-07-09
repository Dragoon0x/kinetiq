"use client";

import { TetherRope } from "@/registry/ui/tether-rope";

export function TetherRopeDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="text-label text-muted-foreground">Grab &amp; swing</p>
      <div className="grid grid-cols-2 gap-3">
        <TetherRope anchor="top" aria-label="Hanging tether rope" height={280} />
        <TetherRope anchor="ends" aria-label="Slung tether cable" height={280} />
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        Drag the rope — Verlet does the rest.
      </p>
    </div>
  );
}
