"use client";

import * as React from "react";

import type { FigurePreset } from "@/registry/lib/figure";
import {
  DitherFigure,
  type DitherFigurePattern,
} from "@/registry/ui/dither-figure";
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

const PATTERNS: ReadonlyArray<{ value: DitherFigurePattern; label: string }> = [
  { value: "bayer", label: "Bayer" },
  { value: "halftone", label: "Halftone" },
  { value: "hatch", label: "Hatch" },
  { value: "dash", label: "Dash" },
];

/** The proving figure — a torus knot rendered as an ordered dither — switching between three's built-in presets and the four threshold patterns. Drag the render itself to orbit. */
export function DitherFigureDemo() {
  const [preset, setPreset] = React.useState<FigurePreset>("knot");
  const [pattern, setPattern] = React.useState<DitherFigurePattern>("bayer");

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <DitherFigure
        preset={preset}
        pattern={pattern}
        className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1"
      >
        <span className="font-mono text-[11px] text-ink-3">drag to orbit</span>
      </DitherFigure>
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
      <SegmentedControl
        value={pattern}
        onValueChange={(value) => setPattern(value as DitherFigurePattern)}
        aria-label="Dither pattern"
      >
        {PATTERNS.map((item) => (
          <SegmentedControlItem key={item.value} value={item.value}>
            {item.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}
