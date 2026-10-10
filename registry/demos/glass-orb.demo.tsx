"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlassOrb } from "@/registry/ui/glass-orb";

export const tweaks = defineTweaks({
  weather: {
    kind: "choice",
    label: "Weather",
    default: "snow",
    options: ["clear", "cloud", "snow", "storm"],
    names: { clear: "Clear", cloud: "Cloud", snow: "Snow", storm: "Storm" },
  },
  refraction: {
    kind: "range",
    label: "Refraction",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "range",
    label: "Tint",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const FORECAST = {
  clear: "clear skies",
  cloud: "low cloud",
  snow: "light snow",
  storm: "a storm",
} as const;

/**
 * Fieldline Forecast: tomorrow's weather on the Coldbrook ridge, kept in a
 * glass orb on the table in front of the temperature.
 */
export function GlassOrbDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stirred, setStirred] = React.useState(false);
  const forecast = FORECAST[values.weather ?? "snow"];

  const scene = (
    <div className="relative w-full">
      <GlassOrb
        backdropText="Coldbrook"
        alt={`A glass orb holding ${forecast}, on a table in front of the word Coldbrook`}
        className="h-[200px]"
        sound={sound}
        onStir={() => setStirred(true)}
        onSettle={() => setStirred(false)}
        {...values}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3.5 top-3 flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <span className="truncate">Fieldline forecast</span>
        <span className="shrink-0 tabular-nums">−2° · tomorrow</span>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{scene}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{forecast}</span>
        {stirred ? " · stirred, settling" : " · drag, tap or press a key"}
      </p>
    </div>
  );
}
