"use client";

import * as React from "react";

import type { FigurePreset } from "@/registry/lib/figure";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { LiquidFigure } from "@/registry/ui/liquid-figure";

const PRESETS: ReadonlyArray<{ value: FigurePreset; label: string }> = [
  { value: "knot", label: "Knot" },
  { value: "sphere", label: "Sphere" },
  { value: "capsule", label: "Capsule" },
  { value: "mark", label: "Mark" },
];

/** The proving figure — a torus knot seen through a flowing liquid sheet — switching between three's built-in presets. Drag the render to orbit, move the pointer over it to stir. */
export function LiquidFigureDemo() {
  const [preset, setPreset] = React.useState<FigurePreset>("knot");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <LiquidFigure
        preset={preset}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <span className="font-mono text-[11px] text-ink-3">
          drag to orbit · move to stir
        </span>
      </LiquidFigure>
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
