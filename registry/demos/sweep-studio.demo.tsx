"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SweepStudio, type SweepStudioSide } from "@/registry/ui/sweep-studio";

export const tweaks = defineTweaks({
  lightRig: {
    kind: "choice",
    label: "Lights",
    default: "soft",
    options: ["soft", "rim", "top", "window"],
    names: { soft: "Soft", rim: "Rim", top: "Top", window: "Window" },
  },
  angle: {
    kind: "range",
    label: "Angle",
    default: -18,
    min: -40,
    max: 40,
    step: 2,
    unit: "°",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "graphite",
    options: ["graphite", "silver", "sand", "cobalt"],
    names: {
      graphite: "Graphite",
      silver: "Silver",
      sand: "Sand",
      cobalt: "Cobalt",
    },
  },
});

const SIDES: Record<SweepStudioSide, string> = {
  front: "front · drag to turn it round",
  edge: "an edge · keep turning",
  back: "the back · let go and it faces you",
};

/**
 * The launch shot for Waylight 2: the new trips screen on a phone in the
 * studio, on a turntable you can spin.
 */
export function SweepStudioDemo({
  chrome = true,
  // The studio is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [side, setSide] = React.useState<SweepStudioSide>("front");

  if (!chrome) {
    return (
      <div className="flex w-full">
        <SweepStudio
          label="Waylight 2 on a turntable"
          onSideChange={setSide}
          className="h-[32rem] w-full"
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight 2 · launch
        </p>
        <p className="text-base font-medium text-foreground">
          Your trips, at a glance
        </p>
      </div>
      <SweepStudio
        label="Waylight 2 on a turntable"
        onSideChange={setSide}
        className="h-[28rem] w-full border border-hairline"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">showing</span> {SIDES[side]}
      </p>
    </div>
  );
}
