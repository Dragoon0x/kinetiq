"use client";

import { BandType } from "@/registry/ui/band-type";

export function BandTypeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-6 py-6">
      <BandType
        text="404"
        bands={9}
        className="font-mono text-[9rem] leading-none font-bold text-ink"
      />
      <BandType
        text="adrift"
        as="h2"
        bands={5}
        slip={18}
        className="text-[3.5rem] leading-none font-semibold text-ink"
      />
      <p className="text-sm text-ink-3">move across it</p>
    </div>
  );
}
