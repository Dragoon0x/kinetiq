"use client";

import * as React from "react";

import type { FigurePreset } from "@/registry/lib/figure";
import { ParticleFigure } from "@/registry/ui/particle-figure";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";

const PRESETS: ReadonlyArray<{ value: FigurePreset; label: string }> = [
  { value: "knot", label: "Knot" },
  { value: "sphere", label: "Sphere" },
  { value: "capsule", label: "Capsule" },
  { value: "mark", label: "Mark" },
];

/** The proving figure — a torus knot resampled as a cloud of points — switching between three's built-in presets. Move the cursor over the render to scatter it; drag to orbit. */
export function ParticleFigureDemo() {
  const [preset, setPreset] = React.useState<FigurePreset>("knot");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <ParticleFigure
        preset={preset}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <span className="font-mono text-[11px] text-ink-3">
          drag to orbit · move to scatter
        </span>
      </ParticleFigure>
      <SegmentedControl
        value={preset}
        onValueChange={(value) => setPreset(value as FigurePreset)}
        aria-label="Figure preset"
      >
        {PRESETS.map((item) => (
          <SegmentedControlItem key={item.value} value={item.value}>
            {item.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
