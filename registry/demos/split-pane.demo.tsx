"use client";

import * as React from "react";

import { SplitPane } from "@/registry/ui/split-pane";

export function SplitPaneDemo() {
  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <SplitPane
        defaultSplit={50}
        height={220}
        label="Resize the plan against the readout"
        start={
          <div className="flex h-full flex-col gap-2 p-4">
            <p className="text-label text-ink-3">PLAN</p>
            <p className="text-ink-2 text-sm">
              Drag the divider, or focus it and use the arrow keys. Release near a
              third or the half and it settles there.
            </p>
          </div>
        }
        end={
          <div className="flex h-full flex-col gap-2 p-4">
            <p className="text-label text-ink-3">READOUT</p>
            <p className="text-ink-2 font-mono text-sm">
              4.6 mm · 48 kHz · pass 2 · tolerance held inside a tenth.
            </p>
          </div>
        }
      />

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Divider{" "}
        <span className="text-[var(--signal,var(--primary))]">
          snaps to thirds
        </span>
      </p>
    </div>
  );
}
