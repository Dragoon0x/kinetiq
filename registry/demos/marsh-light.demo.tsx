"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { MarshLight, type MarshLightState } from "@/registry/ui/marsh-light";

export const tweaks = defineTweaks({
  shyness: {
    kind: "range",
    label: "Shyness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  smoke: {
    kind: "range",
    label: "Smoke",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 150,
    min: 0,
    max: 360,
    step: 10,
    unit: "°",
  },
});

const WORDS: Record<MarshLightState, string> = {
  wandering: "wandering",
  shy: "keeping its distance",
  waiting: "waiting for you",
  gone: "slipped away",
  summoned: "lighting",
};

const BUTTON =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight's night walks: a lantern walk through the fen, and the light that
 * comes to whichever button you tab to.
 */
export function MarshLightDemo({
  chrome = true,
  // The marsh is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<MarshLightState>("wandering");
  const [lit, setLit] = React.useState("Book a walk");
  const [vanished, setVanished] = React.useState(0);

  const scene = (
    <MarshLight
      label="Fen Lane at night"
      className="h-52 w-full"
      onStateChange={setState}
      onVanish={() => setVanished((n) => n + 1)}
      {...values}
    >
      <div className="pointer-events-none flex h-full flex-col justify-between p-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Waylight · Night walks
          </p>
          <p className="max-w-[15rem] text-lg leading-tight font-semibold tracking-tight">
            Lantern walks on Fen Lane
          </p>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-2 self-start">
          <button
            type="button"
            onFocus={() => setLit("Book a walk")}
            className={cn(BUTTON, "bg-primary text-primary-foreground")}
          >
            Book a walk
          </button>
          {chrome ? (
            <button
              type="button"
              onFocus={() => setLit("Route map")}
              className={cn(
                BUTTON,
                "border border-hairline-strong bg-background/40 text-foreground",
              )}
            >
              Route map
            </button>
          ) : null}
        </div>
      </div>
    </MarshLight>
  );

  if (!chrome) return <div className="flex w-full">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {state === "summoned" ? `${WORDS.summoned} “${lit}”` : WORDS[state]}
        </span>
        {vanished > 0
          ? ` · reappeared ${vanished === 1 ? "once" : `${vanished} times`}`
          : " · reach for it"}
      </p>
    </div>
  );
}
