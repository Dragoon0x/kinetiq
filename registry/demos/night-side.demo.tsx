"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultNightSidePoints,
  defaultNightSideRoutes,
  NightSide,
  nightSideReading,
} from "@/registry/ui/night-side";

export const tweaks = defineTweaks({
  timeOfDay: {
    kind: "range",
    label: "Time of day",
    default: 18,
    min: 0,
    max: 24,
    step: 0.5,
    unit: "h",
  },
  arcHeight: {
    kind: "range",
    label: "Arc height",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dotDensity: {
    kind: "range",
    label: "Dot density",
    default: 66,
    min: 36,
    max: 108,
    step: 6,
  },
});

const clock = (hours: number) => {
  const minutes = ((Math.round(hours * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

/**
 * The Gaugeworks network: six offices on one working day, the routes between
 * them carrying the day's traffic while the night comes round.
 */
export function NightSideDemo({
  chrome = true,
  // The globe is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [office, setOffice] = React.useState<string | null>(null);
  const hour = values.timeOfDay ?? tweaks.timeOfDay.default;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <NightSide
          label="Gaugeworks offices"
          value={office}
          onValueChange={setOffice}
          className="h-52 w-full"
          {...values}
        />
      </div>
    );
  }

  const picked = defaultNightSidePoints.find((p) => p.id === office);
  const reading = picked ? nightSideReading(picked, hour) : null;
  const dark = defaultNightSidePoints.filter(
    (p) => nightSideReading(p, hour).phase === "night",
  ).length;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · network
        </p>
        <p className="text-base font-medium text-foreground">
          Six offices, one working day
        </p>
      </div>
      <div className="w-full self-center rounded-3 border border-hairline bg-card">
        <NightSide
          label="Gaugeworks offices"
          value={office}
          onValueChange={setOffice}
          className="h-64 w-full"
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {picked && reading ? (
          <>
            <span className="text-signal">{picked.name}</span> · {reading.time}{" "}
            local · {reading.phase}
          </>
        ) : (
          <>
            <span className="text-signal">{clock(hour)}</span> · {dark} of{" "}
            {defaultNightSidePoints.length} offices in the dark ·{" "}
            {defaultNightSideRoutes.length} routes
          </>
        )}
      </p>
    </div>
  );
}
