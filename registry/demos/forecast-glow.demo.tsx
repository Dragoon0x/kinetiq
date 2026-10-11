"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultForecast,
  ForecastGlow,
  forecastAt,
} from "@/registry/ui/forecast-glow";

export const tweaks = defineTweaks({
  intensity: {
    kind: "range",
    label: "Intensity",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
  blur: {
    kind: "range",
    label: "Blur",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "polar",
    options: ["polar", "violet", "teal", "mono"],
    names: { polar: "Polar", violet: "Violet", teal: "Teal", mono: "Mono" },
  },
});

const START = 18;
const clock = (hour: number) => {
  const minutes = ((Math.round(hour * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};
const word = (kp: number) =>
  kp < 2 ? "quiet" : kp < 4 ? "active" : kp < 6 ? "strong" : "storm";

/**
 * Waylight Lodge's aurora watch: tonight's hourly forecast, and a sky that
 * shows what each hour should look like over the lake.
 */
export function ForecastGlowDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hour, setHour] = React.useState(5);

  if (!chrome) {
    return (
      <div className="flex w-full">
        <ForecastGlow
          label="Tonight's forecast hour"
          value={hour}
          onValueChange={setHour}
          className="h-52 w-full"
          {...values}
        />
      </div>
    );
  }

  const kp = forecastAt(defaultForecast, hour);
  const peak = defaultForecast.indexOf(Math.max(...defaultForecast));

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Lodge · aurora watch
        </p>
        <p className="text-base font-medium text-foreground">
          Tonight over the lake
        </p>
      </div>
      <ForecastGlow
        label="Tonight's forecast hour"
        value={hour}
        onValueChange={setHour}
        className="h-60 w-full"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{clock(START + hour)}</span> · Kp{" "}
        {kp.toFixed(1)} · {word(kp)} · peak at {clock(START + peak)}
      </p>
    </div>
  );
}
