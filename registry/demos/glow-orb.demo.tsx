"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlowOrb } from "@/registry/ui/glow-orb";

export const tweaks = defineTweaks({
  size: {
    kind: "range",
    label: "Size",
    default: 0.6,
    min: 0.2,
    max: 0.9,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "aurora",
    options: ["aurora", "accent", "ember", "lagoon"],
    names: {
      aurora: "Aurora",
      accent: "Accent",
      ember: "Ember",
      lagoon: "Lagoon",
    },
  },
  breath: {
    kind: "range",
    label: "Breath",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks Breathe, a one-minute calm: the invitation sits at the centre of
 * the light. Press and hold to take a deep breath with it.
 */
export function GlowOrbDemo({
  chrome = true,
  // The light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leaning, setLeaning] = React.useState(false);
  const [drawn, setDrawn] = React.useState(false);
  const palette = values.palette ?? "aurora";

  const light = (
    <GlowOrb
      onActiveChange={setLeaning}
      onDeepBreath={setDrawn}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end justify-center p-3 sm:p-4">
        <div className="flex max-w-60 flex-col items-center rounded-3 bg-background/75 px-4 py-2.5 text-center backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Breathe
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Slow down for one minute
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">Breathe with the light</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Begin
              </button>
            </>
          ) : null}
        </div>
      </div>
    </GlowOrb>
  );

  if (!chrome) return <div className="flex w-full">{light}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {light}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {drawn ? (
          <>
            <span className="text-signal">drawn in</span> · a deep breath
          </>
        ) : leaning ? (
          <>
            <span className="text-signal">leaning to you</span> · the halo
            follows
          </>
        ) : (
          <>
            <span className="text-signal">breathing</span> · 7 s cycle ·{" "}
            {palette}
          </>
        )}
      </p>
    </div>
  );
}
