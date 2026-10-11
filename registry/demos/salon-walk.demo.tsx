"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultSalonItems, SalonWalk } from "@/registry/ui/salon-walk";

export const tweaks = defineTweaks({
  wallGap: {
    kind: "range",
    label: "Wall gap",
    default: 1,
    min: 0.6,
    max: 1.6,
    step: 0.1,
    unit: "×",
  },
  sway: {
    kind: "range",
    label: "Sway",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lighting: {
    kind: "choice",
    label: "Lighting",
    default: "warm",
    options: ["warm", "daylight", "candle", "night"],
    names: {
      warm: "Warm",
      daylight: "Daylight",
      candle: "Candle",
      night: "Night",
    },
  },
});

/**
 * The long gallery at an invented house museum, Waylight House: eight
 * paintings from the collection hung salon style down a vaulted corridor.
 */
export function SalonWalkDemo({
  chrome = true,
  // The corridor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const item = defaultSalonItems[index];

  const corridor = (
    <SalonWalk
      value={index}
      onValueChange={setIndex}
      label="The long gallery, Waylight House"
      className={
        chrome
          ? "h-[420px] w-full rounded-4 border border-hairline"
          : "h-[540px] w-full rounded-4 border border-hairline"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-3xl">{corridor}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">The long gallery</p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight House · scroll or arrow keys
        </p>
      </div>
      {corridor}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          level with {index + 1} of {defaultSalonItems.length}
        </span>{" "}
        · {item?.caption?.toLowerCase()}
      </p>
    </div>
  );
}
