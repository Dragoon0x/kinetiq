"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TilledHorizon } from "@/registry/ui/tilled-horizon";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 11,
    min: 6,
    max: 22,
    step: 1,
    unit: "px",
  },
  roll: {
    kind: "range",
    label: "Roll",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "dusk",
    options: ["dusk", "harvest", "indigo", "moss"],
    names: { dusk: "Dusk", harvest: "Harvest", indigo: "Indigo", moss: "Moss" },
  },
});

/**
 * Fieldline Farms' autumn open days: a hero over a field at dusk. Move over it
 * and the sun follows; tab to the button and the sun comes to sit behind it.
 */
export function TilledHorizonDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sun, setSun] = React.useState(0.62);

  const scene = (
    <TilledHorizon
      {...values}
      onSunChange={setSun}
      className="h-full rounded-3"
    >
      <div className="flex size-full flex-col items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Fieldline Farms · open days
          </p>
          <p className="mt-1 max-w-56 text-base leading-snug font-medium text-foreground">
            Autumn ploughing, every Saturday
          </p>
        </div>
        <a
          href="#ride"
          className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Book a ride
        </a>
      </div>
    </TilledHorizon>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 212 }}>
        {scene}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="w-full" style={{ height: 260 }}>
        {scene}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">sun {Math.round(sun * 100)}% along</span>{" "}
        · {values.palette ?? "dusk"} print
      </p>
    </div>
  );
}
