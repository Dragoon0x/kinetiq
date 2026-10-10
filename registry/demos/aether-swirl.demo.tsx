"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AetherSwirl } from "@/registry/ui/aether-swirl";

export const tweaks = defineTweaks({
  warp: {
    kind: "range",
    label: "Warp",
    default: 0.6,
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
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "dusk", "ember", "lagoon"],
    names: { cobalt: "Cobalt", dusk: "Dusk", ember: "Ember", lagoon: "Lagoon" },
  },
  veins: {
    kind: "range",
    label: "Veins",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks Inks, a colour house: its new range is announced over the inks
 * themselves, folding slowly in the bottle.
 */
export function AetherSwirlDemo({
  chrome = true,
  // The colour is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [folding, setFolding] = React.useState(false);
  const palette = values.palette ?? "cobalt";
  const warp = values.warp ?? 0.6;
  const speed = values.speed ?? 0.5;

  const inks = (
    <AetherSwirl
      onActiveChange={setFolding}
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
            Basinworks Inks
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Pigments that move in the bottle
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Twelve colours, ground by hand
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the range
              </button>
            </>
          ) : null}
        </div>
      </div>
    </AetherSwirl>
  );

  if (!chrome) return <div className="flex w-full">{inks}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {inks}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {folding ? (
          <>
            <span className="text-signal">in your hand</span> · the colour folds
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · warp{" "}
            {warp.toFixed(2)} · {speed > 0 ? "drifting" : "still"}
          </>
        )}
      </p>
    </div>
  );
}
