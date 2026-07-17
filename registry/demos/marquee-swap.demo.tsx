"use client";

import { MarqueeSwap } from "@/registry/ui/marquee-swap";

const LINES = ["settles clean.", "holds its line.", "answers the hand.", "never wobbles."];

export function MarqueeSwapDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-2xl font-semibold tracking-tight">
        A good spring{" "}
        <MarqueeSwap
          items={LINES}
          className="text-[var(--signal,var(--primary))]"
        />
      </p>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Lines{" "}
        <span className="text-[var(--signal,var(--primary))]">roll upward</span>
      </p>
    </div>
  );
}
