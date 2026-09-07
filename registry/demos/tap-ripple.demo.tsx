"use client";

import * as React from "react";

import { TapRipple } from "@/registry/ui/tap-ripple";

export function TapRippleDemo() {
  const [last, setLast] = React.useState("None");

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <TapRipple>
        <button
          type="button"
          onClick={() => setLast("Dispatch")}
          className="inline-flex h-9 w-full items-center justify-center rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Dispatch run
        </button>
      </TapRipple>

      <TapRipple>
        <button
          type="button"
          onClick={() => setLast("Rail 14")}
          className="flex h-11 w-full items-center justify-between gap-3 rounded-2 border border-hairline bg-surface-1 px-3 text-left outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="min-w-0 truncate text-sm font-medium">Rail 14</span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            4.42 kN
          </span>
        </button>
      </TapRipple>

      <TapRipple color="var(--accent-wash)">
        <button
          type="button"
          onClick={() => setLast("Basinworks")}
          className="flex w-full flex-col items-start gap-1 rounded-3 border border-hairline bg-card p-4 text-left transition-colors outline-none hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks
          </span>
          <span className="text-sm font-semibold">Sweep sheet, week 31</span>
          <span className="text-xs text-muted-foreground">
            Drift held inside tolerance on every rail in the run.
          </span>
        </button>
      </TapRipple>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Pressed <span className="text-signal">{last}</span>
      </p>
    </div>
  );
}
