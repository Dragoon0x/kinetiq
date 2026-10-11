"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ShowerRadiant, showerReading } from "@/registry/ui/shower-radiant";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 100,
    min: 20,
    max: 200,
    step: 10,
    unit: "/h",
  },
  train: {
    kind: "range",
    label: "Train",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "ice",
    options: ["ice", "green", "gold", "rose"],
    names: { ice: "Ice", green: "Green", gold: "Gold", rose: "Rose" },
  },
});

const clock = (hour: number) => {
  const minutes = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};

function Headline() {
  return (
    <div className="px-4 pt-4">
      <p className="font-mono text-[10px] tracking-[0.08em] text-(--shower-faint) uppercase">
        Coldbrook Dark Sky Park
      </p>
      <p className="mt-1 text-base leading-snug font-medium text-(--shower-ink)">
        The August shower, tonight
      </p>
    </div>
  );
}

/**
 * Coldbrook Dark Sky Park's night of the August shower: scrub the night and
 * the radiant climbs, the meteors with it.
 */
export function ShowerRadiantDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hour, setHour] = React.useState(1);
  const rate = values.rate ?? tweaks.rate.default;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <ShowerRadiant
          hour={hour}
          onHourChange={setHour}
          className="h-[34rem] w-full"
          {...values}
        >
          <Headline />
        </ShowerRadiant>
      </div>
    );
  }

  const now = showerReading(rate, hour);

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <ShowerRadiant
        hour={hour}
        onHourChange={setHour}
        className="h-[30rem] w-full"
        {...values}
      >
        <Headline />
      </ShowerRadiant>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{clock(hour)}</span> · about {now.perHour}{" "}
        an hour · radiant {now.altitude}° up
      </p>
    </div>
  );
}
