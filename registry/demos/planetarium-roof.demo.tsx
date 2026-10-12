"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPlanetariumImages,
  PlanetariumRoof,
} from "@/registry/ui/planetarium-roof";

export const tweaks = defineTweaks({
  fov: {
    kind: "range",
    label: "Field of view",
    default: 110,
    min: 70,
    max: 150,
    step: 5,
    unit: "°",
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 1,
    min: 0.6,
    max: 1.6,
    step: 0.1,
  },
  inertia: {
    kind: "range",
    label: "Inertia",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Planetarium, the autumn ceiling: twelve prints from the season's
 * walks, hung overhead in four constellations.
 */
export function PlanetariumRoofDemo({
  chrome = true,
  // The dome is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const prints = defaultPlanetariumImages;
  const item = open === null ? null : prints[open];

  if (!chrome) {
    return (
      <div className="flex w-full">
        <PlanetariumRoof
          label="The autumn ceiling"
          value={open}
          onValueChange={setOpen}
          height={540}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Planetarium · Autumn
        </p>
        <p className="text-base font-medium text-foreground">
          The autumn ceiling
        </p>
      </div>
      <PlanetariumRoof
        label="The autumn ceiling"
        value={open}
        onValueChange={setOpen}
        height={420}
        className="rounded-4 border border-hairline"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {item ? (
          <>
            <span className="text-signal">{item.caption}</span> ·{" "}
            {(open ?? 0) + 1} of {prints.length} · in focus
          </>
        ) : (
          <>
            <span className="text-signal">drag to turn the dome</span> ·{" "}
            {prints.length} prints
          </>
        )}
      </p>
    </div>
  );
}
