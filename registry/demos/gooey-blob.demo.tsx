"use client";

import { GooeyBlob } from "@/registry/ui/gooey-blob";

export function GooeyBlobDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 overflow-hidden rounded-3 border">
        <GooeyBlob height={260} />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Drag{" "}
        <span className="text-[var(--signal,var(--primary))]">
          to pull the goo
        </span>
      </p>
    </div>
  );
}
