"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LouverLight } from "@/registry/ui/louver-light";

export const tweaks = defineTweaks({
  slats: {
    kind: "range",
    label: "Slats",
    default: 40,
    min: 16,
    max: 80,
    step: 4,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 20,
    min: -60,
    max: 60,
    step: 5,
    unit: "°",
  },
  light: {
    kind: "choice",
    label: "Light",
    default: "dawn",
    options: ["dawn", "noon", "dusk", "moon"],
    names: { dawn: "Dawn", noon: "Noon", dusk: "Dusk", moon: "Moon" },
  },
  swing: {
    kind: "range",
    label: "Swing",
    default: 55,
    min: 0,
    max: 90,
    step: 5,
    unit: "°",
  },
});

/**
 * Fernworks Architects presenting a library whose facade is a wall of
 * turning louvres: the hero sits in front of the wall, and light rolls
 * across it.
 */
export function LouverLightDemo({
  chrome = true,
  // The wall is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [bending, setBending] = React.useState(false);
  const slats = values.slats ?? 40;
  const tilt = values.tilt ?? 20;
  const light = values.light ?? "dawn";

  const wall = (
    <LouverLight
      onActiveChange={setBending}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Architects
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            A library lit by its own facade
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                1,200 cedar louvres turn with the sun
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the building
              </button>
            </>
          ) : null}
        </div>
      </div>
    </LouverLight>
  );

  if (!chrome) return <div className="flex w-full">{wall}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {wall}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {bending ? (
          <>
            <span className="text-signal">bending</span> · the light follows you
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {slats} slats at{" "}
            {tilt}°, {light} light
          </>
        )}
      </p>
    </div>
  );
}
