"use client";

import { PlinkoDrop } from "@/registry/ui/plinko-drop";

export function PlinkoDropDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 overflow-hidden rounded-3 border">
        <PlinkoDrop height={280} />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Click{" "}
        <span className="text-[var(--signal,var(--primary))]">
          to drop a ball
        </span>
      </p>
    </div>
  );
}
