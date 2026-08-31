"use client";

import { HoverSwap } from "@/registry/ui/hover-swap";

export function HoverSwapDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3 text-lg font-medium">
      <HoverSwap alternate="still free">Pricing</HoverSwap>
      <HoverSwap alternate="usually within a shift" direction="down">
        Support
      </HoverSwap>
      <HoverSwap alternate="401 instruments">The catalog</HoverSwap>
    </div>
  );
}
