"use client";

import { ParticleNetwork } from "@/registry/ui/particle-network";

export function ParticleNetworkDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 overflow-hidden rounded-3 border">
        <ParticleNetwork height={260} />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Move{" "}
        <span className="text-[var(--signal,var(--primary))]">
          to gather the web
        </span>
      </p>
    </div>
  );
}
