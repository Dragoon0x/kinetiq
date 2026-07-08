"use client";

import { ReadoutGrid } from "@/registry/blocks/readout-grid/readout-grid";

export function ReadoutGridDemo() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <p className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        Lab telemetry · live
      </p>
      <ReadoutGrid />
    </div>
  );
}
