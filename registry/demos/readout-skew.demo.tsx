"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ReadoutSkew } from "@/registry/ui/readout-skew";

export const tweaks = defineTweaks({
  readout: {
    kind: "range",
    label: "Readout",
    default: 600,
    min: 200,
    max: 2000,
    step: 100,
    unit: "ms",
  },
  bands: {
    kind: "range",
    label: "Bands",
    default: 1,
    min: 1,
    max: 4,
    step: 1,
  },
  skew: {
    kind: "range",
    label: "Skew",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * Waylight's sensor lab: a test bench seen through a rolling-shutter
 * camera, where the propeller bends into petals and a thrown puck leans.
 */
export function ReadoutSkewDemo({
  chrome = true,
  // The scene is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState(0.3);
  const readout = values.readout ?? 600;
  const bands = values.bands ?? 1;

  const scene = (
    <ReadoutSkew
      value={at}
      onValueChange={setAt}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <p className="absolute right-8 bottom-2.5 font-mono text-[10px] leading-none tracking-[0.08em] text-ink-2 uppercase">
        Waylight · sensor lab
      </p>
    </ReadoutSkew>
  );

  if (!chrome) return <div className="flex w-full">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          roll {readout} ms · {bands === 1 ? "1 band" : `${bands} bands`}
        </span>{" "}
        · puck at {Math.round(at * 100)}%
      </p>
    </div>
  );
}
