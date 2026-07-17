"use client";

import * as React from "react";

import { SkeletonWeave } from "@/registry/ui/skeleton-weave";

export function SkeletonWeaveDemo() {
  const [loading, setLoading] = React.useState(true);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="border-hairline bg-surface-1 min-h-24 rounded-3 border p-4">
        <SkeletonWeave
          loading={loading}
          rows={["100%", "88%", "56%"]}
          loadingLabel="Loading the field note"
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold">Bearing locked</p>
            <p className="text-ink-2 text-sm">
              The rig settled at 4.6 mm after two passes. Tolerance held inside a
              tenth the whole run.
            </p>
          </div>
        </SkeletonWeave>
      </div>

      <button
        type="button"
        onClick={() => setLoading((value) => !value)}
        className="border-input hover:bg-accent self-start rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
      >
        {loading ? "Deliver" : "Reload"}
      </button>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        State{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {loading ? "waiting" : "delivered"}
        </span>
      </p>
    </div>
  );
}
