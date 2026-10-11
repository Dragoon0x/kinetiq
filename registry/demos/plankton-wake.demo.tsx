"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PlanktonWake } from "@/registry/ui/plankton-wake";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 44,
    min: 8,
    max: 80,
    step: 4,
  },
  glowDecay: {
    kind: "range",
    label: "Glow time",
    default: 1.4,
    min: 0.4,
    max: 4,
    step: 0.2,
    unit: "s",
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 196,
    min: 150,
    max: 262,
    step: 4,
    unit: "°",
  },
});

/**
 * Basinworks night paddles: the hero of a tour page is the bay itself, dark
 * until your hand moves through it.
 */
export function PlanktonWakeDemo({
  chrome = true,
  // The water is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [glowing, setGlowing] = React.useState(false);
  const [rings, setRings] = React.useState(0);

  const water = (
    <PlanktonWake
      className={cn("w-full rounded-3", chrome ? "h-60" : "h-52")}
      onGlowChange={setGlowing}
      onPulse={setRings}
      {...values}
    >
      <div className="flex size-full flex-col justify-between gap-3 p-4 sm:p-5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-primary-foreground/70 uppercase">
          Basinworks · Night paddles
        </p>
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[16rem] text-[clamp(1.05rem,4.2cqi,1.4rem)] leading-tight font-semibold tracking-[-0.01em] text-balance text-primary-foreground">
            Paddle out after dark.
          </p>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-2 border border-primary-foreground/25 bg-primary-foreground/10 px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary-foreground/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Book a night paddle
          </button>
        </div>
      </div>
    </PlanktonWake>
  );

  if (!chrome) return <div className="@container flex w-full">{water}</div>;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      {water}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {rings > 0 ? (
          <>
            <span className="text-signal">ring sent</span> · {rings} so far
            {glowing ? " · still glowing" : ""}
          </>
        ) : glowing ? (
          <>
            <span className="text-signal">glowing</span> · your wake, fading
          </>
        ) : (
          <>
            <span className="text-signal">dark water</span> · move through it,
            or click
          </>
        )}
      </p>
    </div>
  );
}
