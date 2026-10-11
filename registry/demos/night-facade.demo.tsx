"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { clockOf, NightFacade } from "@/registry/ui/night-facade";

export const tweaks = defineTweaks({
  hour: {
    kind: "range",
    label: "Hour",
    default: 21,
    min: 18,
    max: 28,
    step: 0.25,
  },
  floors: {
    kind: "range",
    label: "Floors",
    default: 10,
    min: 6,
    max: 16,
    step: 1,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  silhouettes: { kind: "toggle", label: "Figures", default: true },
});

/**
 * Waylight, a sleep app: its wind-down screen is the block across the street,
 * going to bed window by window. Drag the rail to move the night on.
 */
export function NightFacadeDemo({
  chrome = true,
  // The building is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  hour: tweakHour = tweaks.hour.default,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The tweak sets the hour; the rail moves it on from there.
  const [seen, setSeen] = React.useState(tweakHour);
  const [hour, setHour] = React.useState(tweakHour);
  if (seen !== tweakHour) {
    setSeen(tweakHour);
    setHour(tweakHour);
  }
  const warmth = values.warmth ?? tweaks.warmth.default;
  const floors = values.floors ?? tweaks.floors.default;
  const lamps = warmth < 0.34 ? "cool" : warmth < 0.67 ? "warm" : "amber";

  const facade = (
    <NightFacade
      label="The block across the street"
      hour={hour}
      onHourChange={setHour}
      className={
        chrome
          ? "h-[480px] rounded-3 border border-hairline"
          : "h-[540px] rounded-3 border border-hairline"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{facade}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · nights
          </p>
          <p className="text-base font-medium text-foreground">
            The street is winding down
          </p>
        </div>
        <p className="font-mono text-2xl leading-none font-medium text-foreground tabular-nums">
          {clockOf(hour)}
        </p>
      </div>
      {facade}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{clockOf(hour)}</span> · {floors} floors ·{" "}
        {lamps} lamps
      </p>
    </div>
  );
}
