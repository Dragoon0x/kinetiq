"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GrainMesh } from "@/registry/ui/grain-mesh";

export const tweaks = defineTweaks({
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "poster",
    options: ["poster", "harbor", "orchard", "dusk"],
    names: {
      poster: "Poster",
      harbor: "Harbor",
      orchard: "Orchard",
      dusk: "Dusk",
    },
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * Basinworks Press prints posters in small runs: its hero is a print still
 * on the drum, the inks drifting under the grain.
 */
export function GrainMeshDemo({
  chrome = true,
  // The print is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // Reduced motion holds the field still, whatever the speed says.
  const motionSafe = useMotionSafe();
  const [leaning, setLeaning] = React.useState(false);
  const [held, setHeld] = React.useState<number | null>(null);
  const palette = values.palette ?? "poster";
  const grain = values.grain ?? 0.55;
  const drift = values.drift ?? 0.6;

  const print = (
    <GrainMesh
      onActiveChange={setLeaning}
      onGrab={setHeld}
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
            Basinworks Press
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Prints in small, uneven runs
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Two drums, six inks, one paper stock
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the runs
              </button>
            </>
          ) : null}
        </div>
      </div>
    </GrainMesh>
  );

  if (!chrome) return <div className="flex w-full">{print}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {print}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {held !== null ? (
          <>
            <span className="text-signal">pulling</span> · ink {held + 1} of 5
          </>
        ) : leaning ? (
          <>
            <span className="text-signal">leaning</span> · the nearest ink
            follows
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · grain{" "}
            {grain.toFixed(2)} ·{" "}
            {drift > 0 && motionSafe ? "drifting" : "still"}
          </>
        )}
      </p>
    </div>
  );
}
