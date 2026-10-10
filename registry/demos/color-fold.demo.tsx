"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ColorFold } from "@/registry/ui/color-fold";

export const tweaks = defineTweaks({
  bands: {
    kind: "range",
    label: "Bands",
    default: 5,
    min: 3,
    max: 7,
    step: 1,
  },
  curve: {
    kind: "range",
    label: "Curve",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "clay", "sea", "dusk"],
    names: { cobalt: "Cobalt", clay: "Clay", sea: "Sea", dusk: "Dusk" },
  },
});

/**
 * Basinworks Paint, launching a range of house colours: the announcement
 * sits on the colours themselves, folded round one another.
 */
export function ColorFoldDemo({
  chrome = true,
  // The ribbons are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [active, setActive] = React.useState(false);
  const palette = values.palette ?? "cobalt";
  const bands = values.bands ?? 5;
  const curve = values.curve ?? 0.55;

  const paint = (
    <ColorFold
      onActiveChange={setActive}
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
            Basinworks Paint
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Colours that fold into each other
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">Five new house colours</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Order swatches
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ColorFold>
  );

  if (!chrome) return <div className="flex w-full">{paint}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {paint}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {active ? (
          <>
            <span className="text-signal">in your hand</span> · the ribbons part
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · {bands} bands ·
            curve {curve.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
