"use client";

import { GradientDrift } from "@/registry/ui/gradient-drift";

export function GradientDriftDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline overflow-hidden rounded-3 border">
        <GradientDrift height={260}>
          <div className="flex h-full flex-col justify-end p-5">
            <p className="text-label text-ink-3">AMBIENT</p>
            <p className="text-ink mt-1 text-xl font-semibold">
              A quiet, drifting wash
            </p>
          </div>
        </GradientDrift>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Backdrop{" "}
        <span className="text-[var(--signal,var(--primary))]">
          CSS-only, no canvas
        </span>
      </p>
    </div>
  );
}
