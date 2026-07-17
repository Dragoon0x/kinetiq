"use client";

import { HoverCard } from "@/registry/ui/hover-card";

export function HoverCardDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-5 text-sm">
      <p className="text-ink-2 leading-relaxed">
        Last sweep signed off by{" "}
        <HoverCard
          trigger={
            <button
              type="button"
              className="text-cobalt focus-visible:ring-cobalt-bright/50 rounded-1 font-medium underline decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
            >
              Field Unit A-9
            </button>
          }
        >
          <div className="flex items-start gap-3">
            <span className="bg-cobalt-wash text-cobalt grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold">
              A9
            </span>
            <div className="min-w-0">
              <p className="text-ink font-semibold">Field Unit A-9</p>
              <p className="text-ink-3 text-xs">Autonomous survey drone</p>
            </div>
          </div>
          <p className="text-ink-2 mt-3 text-xs leading-relaxed">
            Logged 1,204 traverses across the northern shelf. Last check-in
            eleven minutes ago.
          </p>
          <div className="border-border mt-3 flex gap-4 border-t pt-3 text-xs">
            <span className="text-ink-3">
              Uptime <span className="text-ink font-medium">99.2%</span>
            </span>
            <span className="text-ink-3">
              Range <span className="text-ink font-medium">14 km</span>
            </span>
          </div>
        </HoverCard>{" "}
        before dawn.
      </p>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Hover or focus{" "}
        <span className="text-[var(--signal,var(--primary))]">the name</span>
      </p>
    </div>
  );
}
