"use client";

import * as React from "react";

import { FrostWipe } from "@/registry/ui/frost-wipe";

function Readout() {
  return (
    <div className="bg-surface-1 flex h-full flex-col justify-center gap-2 p-5">
      <p className="text-label text-ink-3">COLD STORE · BAY 3</p>
      <p className="text-ink font-mono text-2xl tracking-wide">-18.4°</p>
      <div className="text-ink-3 space-y-0.5 font-mono text-[10px]">
        <p>compressor duty 41%</p>
        <p>door sealed · 214 days</p>
      </div>
    </div>
  );
}

export function FrostWipeDemo() {
  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">COLD STORE GLASS</p>
          <p className="text-label text-ink-3">KQ-098</p>
        </div>

        <FrostWipe height={210} aria-label="Frosted cold-store window">
          <Readout />
        </FrostWipe>

        <p className="text-ink-3 mt-3 text-center text-xs">
          Wipe the glass to read the bay - stand still and it frosts over.
        </p>
      </div>
    </div>
  );
}
