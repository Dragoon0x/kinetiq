"use client";

import { NewtonCradle } from "@/registry/ui/newton-cradle";

export function NewtonCradleDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 rounded-3 border px-4 py-3">
        <NewtonCradle />
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Momentum{" "}
        <span className="text-[var(--signal,var(--primary))]">end to end</span>
      </p>
    </div>
  );
}
