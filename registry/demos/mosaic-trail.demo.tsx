"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MosaicTrail } from "@/registry/ui/mosaic-trail";

export const tweaks = defineTweaks({
  cell: {
    kind: "range",
    label: "Cell",
    default: 14,
    min: 8,
    max: 28,
    step: 2,
    unit: "px",
  },
  fade: {
    kind: "range",
    label: "Fade",
    default: 900,
    min: 300,
    max: 2400,
    step: 100,
    unit: "ms",
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "aurora",
    options: ["aurora", "ember", "ink"],
    names: { aurora: "Aurora", ember: "Ember", ink: "Ink" },
  },
});

/**
 * Fieldline's route planner: the hero band is a mosaic that paints the
 * visitor's path in pixels, the way the planner draws a route as you go.
 */
export function MosaicTrailDemo({
  chrome = true,
  // The mosaic is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(false);
  const [framed, setFramed] = React.useState<string | null>(null);
  const fade = values.fade ?? tweaks.fade.default;

  const scene = (
    <div
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) {
          setFramed(event.target.textContent ?? null);
        }
      }}
      onBlur={() => setFramed(null)}
      className="w-full"
    >
      <MosaicTrail
        onActiveChange={setActive}
        className="h-52 w-full rounded-3 border border-hairline bg-card"
        {...values}
      >
        <div className="flex h-full flex-col justify-end gap-3 p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fieldline · route planner
            </p>
            <p className="max-w-[18rem] text-lg leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
              Every route, drawn as you go.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Plan a route
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Sample maps
            </button>
          </div>
        </div>
      </MosaicTrail>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {framed ? (
          <>
            <span className="text-signal">framing</span> · {framed}
          </>
        ) : active ? (
          <>
            <span className="text-signal">painting</span> · the trail fades in{" "}
            {(fade / 1000).toFixed(1)} s
          </>
        ) : (
          <>
            <span className="text-signal">field at rest</span> · move across it,
            click for a burst
          </>
        )}
      </p>
    </div>
  );
}
