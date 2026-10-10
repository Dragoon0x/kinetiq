"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PrismSpill } from "@/registry/ui/prism-spill";

export const tweaks = defineTweaks({
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.1,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight Optics, a lens maker: the notes on its crown glass sit beside a
 * prism of it, splitting the light that falls across the page.
 */
export function PrismSpillDemo({
  chrome = true,
  // The light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [turning, setTurning] = React.useState(false);
  const spread = values.spread ?? 0.5;
  const speed = values.speed ?? 0.5;

  const light = (
    <PrismSpill
      onActiveChange={setTurning}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start justify-end p-3 sm:p-4">
        <div className="max-w-56 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Optics
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Light, taken apart
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Hand-polished crown glass
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Read the notes
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PrismSpill>
  );

  if (!chrome) return <div className="flex w-full">{light}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {light}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {turning ? (
          <>
            <span className="text-signal">turning</span> · the spectrum swings
          </>
        ) : (
          <>
            <span className="text-signal">spread {spread.toFixed(2)}</span> ·{" "}
            {speed > 0 ? "swaying slowly" : "held still"}
          </>
        )}
      </p>
    </div>
  );
}
