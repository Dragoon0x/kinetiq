"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EtchedBricks } from "@/registry/ui/etched-bricks";

export const tweaks = defineTweaks({
  brick: {
    kind: "range",
    label: "Brick",
    default: 22,
    min: 14,
    max: 36,
    step: 2,
    unit: "px",
  },
  bevel: {
    kind: "range",
    label: "Bevel",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * The Waylight Hotel's lobby wall: a sunrise laid in etched glass bricks,
 * lit from the courtyard behind it.
 */
export function EtchedBricksDemo({
  chrome = true,
  // The wall is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sweeps, setSweeps] = React.useState(0);

  if (!chrome) {
    return (
      <div className="flex w-full">
        <EtchedBricks scene="dawn" className="h-52 w-full" {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Hotel · lobby wall
        </p>
        <p className="text-base font-medium text-foreground">
          Sunrise, laid in glass
        </p>
      </div>
      <EtchedBricks
        scene="dawn"
        onSweep={() => setSweeps((n) => n + 1)}
        className="h-60 w-full"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {sweeps === 0 ? "waiting for light" : `sweep ${sweeps}`}
        </span>{" "}
        · click the wall or press enter
      </p>
    </div>
  );
}
