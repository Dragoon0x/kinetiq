"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { CatseyeMarble } from "@/registry/ui/catseye-marble";

export const tweaks = defineTweaks({
  ribbon: {
    kind: "choice",
    label: "Ribbon",
    default: "ember",
    options: ["ember", "lagoon", "moss", "ink"],
    names: { ember: "Ember", lagoon: "Lagoon", moss: "Moss", ink: "Ink" },
  },
  gloss: {
    kind: "range",
    label: "Gloss",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  roll: {
    kind: "range",
    label: "Friction",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Story =
  { kind: "rest" } | { kind: "rolling" } | { kind: "clack"; speed: number };

/**
 * Basinworks Games, No. 14: one cat's eye in its felt tray, ready to roll.
 */
export function CatseyeMarbleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "rest" });
  const [resetKey, setResetKey] = React.useState(0);

  const tray = (
    <div className="relative w-full">
      <CatseyeMarble
        sound={sound}
        resetKey={resetKey}
        onRoll={() => setStory({ kind: "rolling" })}
        onBounce={(speed) => setStory({ kind: "clack", speed })}
        onRest={() => setStory({ kind: "rest" })}
        label="Cat's eye marble"
        className={cn("w-full", chrome ? "h-60" : "h-52")}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-3 rounded-full border border-hairline bg-card/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Basinworks · No. 14
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{tray}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {tray}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {story.kind === "rolling" ? (
            <>
              <span className="text-signal">rolling</span> · the ribbon turns
              with it
            </>
          ) : story.kind === "clack" ? (
            <>
              <span className="text-signal">clack</span> · {story.speed} px/s
              into the wall
            </>
          ) : (
            <>
              <span className="text-signal">resting</span> · drag to roll
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setResetKey((k) => k + 1)}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Roll home
        </button>
      </div>
    </div>
  );
}
