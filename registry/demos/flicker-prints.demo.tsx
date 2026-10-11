"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  FlickerPrints,
  defaultFlickerPrints,
} from "@/registry/ui/flicker-prints";

export const tweaks = defineTweaks({
  frames: {
    kind: "range",
    label: "Frames",
    default: 5,
    min: 2,
    max: 8,
    step: 1,
  },
  ridges: {
    kind: "range",
    label: "Ridges",
    default: 28,
    min: 12,
    max: 60,
    step: 4,
  },
  curve: {
    kind: "range",
    label: "Curve",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const MOTION: Record<string, string> = {
  door: "the door opens",
  heron: "the heron lifts",
  wave: "the wave breaks",
  lamp: "the lamps come on",
  sail: "the boat crosses",
  poppy: "the poppy opens",
};

/**
 * The Coldbrook harbour shop's rack of lenticular postcards: six cards on a
 * drum, each one moving as it turns past.
 */
export function FlickerPrintsDemo({
  chrome = true,
  // The cards are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(1);
  const item = defaultFlickerPrints[index];

  const carousel = (
    <FlickerPrints
      label="Coldbrook harbour postcards"
      value={index}
      onValueChange={setIndex}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{carousel}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <p className="text-sm font-medium text-foreground">
          Coldbrook Harbour Shop
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Lenticular postcards · 6 designs
        </p>
      </div>
      {carousel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          card {index + 1} of {defaultFlickerPrints.length}
        </span>
        {" · "}
        {MOTION[item?.scene ?? "door"]} · drag to turn
      </p>
    </div>
  );
}
