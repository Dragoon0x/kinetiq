"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultSwatches, SwatchLadder } from "@/registry/ui/swatch-ladder";

export const tweaks = defineTweaks({
  strips: {
    kind: "range",
    label: "Strips",
    default: 8,
    min: 3,
    max: 12,
    step: 1,
  },
  wave: {
    kind: "range",
    label: "Wave",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shade: {
    kind: "range",
    label: "Shade",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks Paint Co.'s autumn card: eight paints fanned out as sample
 * strips. Point at one to read it, click a chip to copy the tint.
 */
export function SwatchLadderDemo({
  chrome = true,
  // The strips are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState<number | null>(null);
  const [last, setLast] = React.useState<string | null>(null);
  const shown = Math.min(defaultSwatches.length, values.strips ?? 8);
  const reading = index !== null ? defaultSwatches[index] : undefined;

  const ladder = (
    <SwatchLadder
      value={index}
      onValueChange={(next) => {
        setIndex(next);
        setLast(null);
      }}
      onCopy={(color, info) =>
        setLast(`${info.name} · tint ${info.step} · ${color}`)
      }
      label="Fernworks autumn card"
      {...values}
    />
  );

  // On a card the readout can wrap to a second line at phone widths, so
  // the strips give up a little height to keep the whole ladder inside.
  if (!chrome)
    return (
      <div className="w-full max-w-xl">
        {React.cloneElement(ladder, { height: 132 })}
      </div>
    );

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Paint Co. · autumn card
        </p>
        <p className="text-sm font-medium text-foreground">
          Twelve quiet colours for north light
        </p>
      </div>
      {ladder}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal">copied</span> · {last}
          </>
        ) : reading ? (
          <>
            <span className="text-signal">reading</span> · {reading.name}
          </>
        ) : (
          <>
            <span className="text-signal">browsing</span> · {shown} colours
          </>
        )}
      </p>
    </div>
  );
}
