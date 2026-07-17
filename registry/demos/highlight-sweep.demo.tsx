"use client";

import * as React from "react";

import { HighlightSweep } from "@/registry/ui/highlight-sweep";

export function HighlightSweepDemo() {
  const [run, setRun] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p key={run} className="text-lg leading-relaxed font-medium">
        A good spring settles with{" "}
        <HighlightSweep tone="accent">one crisp overshoot</HighlightSweep> — never
        a wobble, and never a{" "}
        <HighlightSweep tone="warn">dead stop</HighlightSweep>.
      </p>

      <button
        type="button"
        onClick={() => setRun((value) => value + 1)}
        className="border-input hover:bg-accent self-start rounded-2 border px-2.5 py-1 text-xs font-medium transition-colors"
      >
        Replay
      </button>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Marker{" "}
        <span className="text-[var(--signal,var(--primary))]">sweeps on view</span>
      </p>
    </div>
  );
}
