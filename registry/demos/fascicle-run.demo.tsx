"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FascicleRun } from "@/registry/ui/fascicle-run";

export const tweaks = defineTweaks({
  strands: {
    kind: "range",
    label: "Strands",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  pulse: {
    kind: "range",
    label: "Pulse",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline's neural imaging hero: a flight down a nerve bundle behind the
 * headline, steered by the pointer and sped up by a held press.
 */
export function FascicleRunDemo({
  chrome = true,
  // The flight is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [boosting, setBoosting] = React.useState(false);

  const flight = (
    <FascicleRun
      onBoostChange={setBoosting}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="pointer-events-none flex size-full items-end p-3 sm:p-4">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline · neural imaging
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
            Signals, end to end.
          </p>
        </div>
      </div>
    </FascicleRun>
  );

  if (!chrome) return <div className="flex w-full">{flight}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {flight}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {boosting ? "boosting" : "cruising"}
        </span>{" "}
        · {boosting ? "let go to ease back" : "hold to speed up"}
      </p>
    </div>
  );
}
