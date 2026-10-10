"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PolarGlow } from "@/registry/ui/polar-glow";

export const tweaks = defineTweaks({
  palette: {
    kind: "choice",
    label: "Palette",
    default: "polar",
    options: ["polar", "dusk", "glacier", "ember"],
    names: { polar: "Polar", dusk: "Dusk", glacier: "Glacier", ember: "Ember" },
  },
  intensity: {
    kind: "range",
    label: "Intensity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * Fernworks Lodge, cabins in the far north: the booking hero sits under a
 * sky with an aurora barely there in it.
 */
export function PolarGlowDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(false);
  const palette = values.palette ?? "polar";
  const intensity = values.intensity ?? 0.5;
  const speed = values.speed ?? 0.6;

  const sky = (
    <PolarGlow
      onActiveChange={setActive}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Lodge
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Nights worth staying up for
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Cabins under a northern sky
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Check dates
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PolarGlow>
  );

  if (!chrome) return <div className="flex w-full">{sky}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sky}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {active ? (
          <>
            <span className="text-signal">brightening</span> · the nearest
            curtain
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · intensity{" "}
            {intensity.toFixed(2)} · {speed > 0 ? "drifting" : "still"}
          </>
        )}
      </p>
    </div>
  );
}
