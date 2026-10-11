"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SpiralEngraving,
  type SpiralEngravingSpin,
} from "@/registry/ui/spiral-engraving";

export const tweaks = defineTweaks({
  pitch: {
    kind: "range",
    label: "Pitch",
    default: 4,
    min: 3,
    max: 10,
    step: 0.5,
    unit: "px",
  },
  contrast: {
    kind: "range",
    label: "Contrast",
    default: 1.2,
    min: 0.5,
    max: 2,
    step: 0.1,
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 20,
    min: 0,
    max: 60,
    step: 2,
    unit: "rpm",
  },
});

const STATUS: Record<SpiralEngravingSpin, [string, string]> = {
  still: ["still", "drag round the plate to spin it"],
  turning: ["turning", "the line flows inward"],
  flung: ["flung", "coasting back to its turn"],
};

/**
 * Basinworks Observatory's print room: plate IV of the night series, the
 * quiet moon cut as one line on a turning plate.
 */
export function SpiralEngravingDemo({
  chrome = true,
  // The plate is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<SpiralEngravingSpin>("still");
  const [word, note] = STATUS[state];

  if (!chrome) {
    return (
      <div className="flex w-full justify-center">
        <SpiralEngraving
          className="w-[216px]"
          onSpinChange={setState}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks Observatory · plate IV
        </p>
        <p className="text-sm font-medium text-foreground">
          The quiet moon, cut in one line
        </p>
      </div>
      <SpiralEngraving
        className="w-60 self-center"
        label="Spin plate IV"
        onSpinChange={setState}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{word}</span> · {note}
      </p>
    </div>
  );
}
