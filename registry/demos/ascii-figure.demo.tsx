"use client";

import * as React from "react";

import type { FigurePreset } from "@/registry/lib/figure";
import { AsciiFigure } from "@/registry/ui/ascii-figure";
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

/** The proving figure — a torus knot rendered as ASCII — switching between three's built-in presets. Drag the render itself to orbit. */
export function AsciiFigureDemo() {
  const [preset, setPreset] = React.useState<FigurePreset>("knot");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <AsciiFigure
        preset={preset}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <span className="font-mono text-[11px] text-ink-3">drag to orbit</span>
      </AsciiFigure>
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
