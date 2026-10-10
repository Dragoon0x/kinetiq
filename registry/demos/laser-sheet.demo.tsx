"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LaserSheet } from "@/registry/ui/laser-sheet";

export const tweaks = defineTweaks({
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "signal", "ember", "rose"],
    names: { cobalt: "Cobalt", signal: "Signal", ember: "Ember", rose: "Rose" },
  },
});

/**
 * Basinworks Survey: the basin floor is mapped by a sheet of light swept
 * across it, and the hero shows the instrument doing exactly that.
 */
export function LaserSheetDemo({
  chrome = true,
  // The beam is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [fired, setFired] = React.useState(0);
  const [near, setNear] = React.useState(false);

  const scene = (
    <LaserSheet
      source={[0.7, 0.08]}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        chrome ? "h-64" : "h-52",
      )}
      onFire={() => setFired((n) => n + 1)}
      {...values}
    >
      <div
        className="flex size-full flex-col justify-end gap-3 p-5 sm:p-6"
        onPointerEnter={() => setNear(true)}
        onPointerLeave={() => setNear(false)}
      >
        <div className="max-w-xs">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Survey
          </p>
          <p className="mt-1 text-xl leading-snug font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
            Every contour, measured by light.
          </p>
          {chrome ? (
            <p className="mt-1 text-sm text-ink-2">
              One sheet of light, swept across the basin floor each night.
            </p>
          ) : null}
        </div>
        <div>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            See the survey
          </button>
        </div>
      </div>
    </LaserSheet>
  );

  if (!chrome) return <div className="flex w-full">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {fired > 0 ? (
          <>
            <span className="text-signal">
              fired {fired} {fired === 1 ? "time" : "times"}
            </span>{" "}
            · the floor line flares where it lands
          </>
        ) : near ? (
          <>
            <span className="text-signal">steered by you</span> · press to fire
            a pulse
          </>
        ) : (
          <>
            <span className="text-signal">sweeping</span> · the sheet swings
            across the floor
          </>
        )}
      </p>
    </div>
  );
}
