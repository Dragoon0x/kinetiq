"use client";

import { GradientTitle } from "@/registry/ui/gradient-title";

export function GradientTitleDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GradientTitle as="h2" className="text-3xl leading-tight font-semibold">
        Move your pointer across the sheen.
      </GradientTitle>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Sheen{" "}
        <span className="text-[var(--signal,var(--primary))]">
          tracks the pointer
        </span>
      </p>
    </div>
  );
}
