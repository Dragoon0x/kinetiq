"use client";

import * as React from "react";

import { ScopeScrubber } from "@/registry/ui/scope-scrubber";

export function ScopeScrubberDemo() {
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <p className="text-muted-foreground font-mono text-xs tracking-[0.08em] uppercase">
        Imaging console
      </p>
      <ScopeScrubber
        label="Exposure"
        min={0}
        max={400}
        step={5}
        settle="snap"
        unit="ms"
        defaultValue={120}
      />
      <ScopeScrubber
        label="Gain"
        min={0}
        max={24}
        step={0.5}
        settle="recoil"
        unit="dB"
        defaultValue={6}
      />
      <p className="text-muted-foreground font-mono text-xs">
        Scrub horizontally · double-click to type
      </p>
    </div>
  );
}
