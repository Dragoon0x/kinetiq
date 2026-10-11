"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ColonnadePass } from "@/registry/ui/colonnade-pass";

export const tweaks = defineTweaks({
  columns: {
    kind: "range",
    label: "Columns",
    default: 6,
    min: 3,
    max: 12,
    step: 1,
  },
  sunAngle: {
    kind: "range",
    label: "Sun angle",
    default: 25,
    min: -60,
    max: 60,
    step: 5,
    unit: "°",
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0,
    max: 2.5,
    step: 0.1,
    unit: "m/s",
  },
});

/**
 * Basinworks Cloister, a hotel around a quiet court: the hero is a slow walk
 * past its colonnade, and the pointer moves the sun.
 */
export function ColonnadePassDemo({
  chrome = true,
  // The walk is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sun, setSun] = React.useState(values.sunAngle ?? 25);
  // The tweak moves the sun; the scene reports back what the hand did.
  const [seen, setSeen] = React.useState(values.sunAngle);
  if (seen !== values.sunAngle) {
    setSeen(values.sunAngle);
    setSun(values.sunAngle ?? 25);
  }
  const [walking, setWalking] = React.useState(true);
  const pace = values.pace ?? 1;
  // Under reduced motion the walker stands still, so there is nothing to stop.
  const motionSafe = useMotionSafe();
  const moving = walking && pace > 0 && motionSafe;

  const scene = (
    <ColonnadePass
      onValueChange={setSun}
      paused={!walking}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3 sm:p-4">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Cloister
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-balance text-foreground">
            Rooms around a quiet court.
          </p>
        </div>
      </div>
    </ColonnadePass>
  );

  if (!chrome) return <div className="flex w-full">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {scene}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">sun {Math.round(sun)}°</span> ·{" "}
          {moving ? `walking ${pace.toFixed(1)} m/s` : "standing"}
        </p>
        {motionSafe ? (
          <button
            type="button"
            aria-pressed={!walking}
            onClick={() => setWalking((w) => !w)}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {walking ? "Stop walking" : "Walk on"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
