"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlowRain } from "@/registry/ui/glow-rain";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["cobalt", "amber", "rose", "mint"],
    names: { cobalt: "Cobalt", amber: "Amber", rose: "Rose", mint: "Mint" },
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Night Market, open late under the arches: the poster sits in a
 * slow fall of lamplit rain that leans with the visitor's hand.
 */
export function GlowRainDemo({
  chrome = true,
  // The rain is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leaning, setLeaning] = React.useState(false);
  const density = values.density ?? 0.55;

  const rain = (
    <GlowRain
      onActiveChange={setLeaning}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Night Market
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Open late, rain or shine
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Fridays from 18:00, under the arches
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Plan a visit
              </button>
            </>
          ) : null}
        </div>
      </div>
    </GlowRain>
  );

  if (!chrome) return <div className="flex w-full">{rain}</div>;

  const weight =
    density < 0.3 ? "drizzle" : density < 0.7 ? "light rain" : "steady rain";

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {rain}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {leaning ? (
          <>
            <span className="text-signal">in the wind</span> · the rain leans
            with you
          </>
        ) : (
          <>
            <span className="text-signal">{weight}</span> · leaning 6° east
          </>
        )}
      </p>
    </div>
  );
}
