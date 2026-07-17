"use client";

import { TrailInk } from "@/registry/ui/trail-ink";

export function TrailInkDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TrailInk height={240} fade={1.4} aria-label="Ink trail panel" />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Ink{" "}
        <span className="text-[var(--signal,var(--primary))]">
          dries and fades
        </span>
      </p>
    </div>
  );
}
