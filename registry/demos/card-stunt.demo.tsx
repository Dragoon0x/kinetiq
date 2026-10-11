"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CardStunt, defaultCardStuntFrames } from "@/registry/ui/card-stunt";

export const tweaks = defineTweaks({
  rows: {
    kind: "range",
    label: "Rows",
    default: 8,
    min: 5,
    max: 12,
    step: 1,
  },
  wave: {
    kind: "range",
    label: "Wave",
    default: 1,
    min: 0.5,
    max: 2.5,
    step: 0.25,
    unit: "×",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "home",
    options: ["home", "sunset", "harbor", "ink"],
    names: { home: "Home", sunset: "Sunset", harbor: "Harbor", ink: "Ink" },
  },
});

/**
 * Fieldline FC's season opener: the home end rehearses its card routine —
 * a sunrise, GO, the club stripes and a target — before kick-off.
 */
export function CardStuntDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const frames = defaultCardStuntFrames;

  const stand = (
    <CardStunt
      label="Home end card routine"
      className="h-52 w-full"
      index={index}
      onIndexChange={setIndex}
      onPausedChange={setHeld}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{stand}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Fieldline FC · Matchday 1
        </p>
        <p className="font-mono text-[11px] text-ink-3 tabular-nums">
          Saturday 15:00
        </p>
      </div>
      {stand}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          frame {index + 1} of {frames.length} · {frames[index]?.label}
        </span>
        {held
          ? " · paused · space resumes"
          : " · arrows step · point to flip early"}
      </p>
    </div>
  );
}
