"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PinscreenSwell } from "@/registry/ui/pinscreen-swell";

export const tweaks = defineTweaks({
  pitch: {
    kind: "range",
    label: "Pitch",
    default: 9,
    min: 5,
    max: 16,
    step: 1,
    unit: "px",
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  light: {
    kind: "range",
    label: "Light",
    default: 315,
    min: 0,
    max: 345,
    step: 15,
    unit: "°",
  },
});

/**
 * The pin screen on a desk at Gaugeworks Studio: a swell rolls under the
 * pins; press to leave a mark, click to push a dent.
 */
export function PinscreenSwellDemo({
  chrome = true,
  // The pins are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [dent, setDent] = React.useState<[number, number] | null>(null);

  const toy = (
    <div
      className="w-full rounded-4 border border-hairline-strong p-2.5"
      style={{ backgroundColor: "oklch(0.2 0.01 250)" }}
    >
      <PinscreenSwell
        className={chrome ? "h-44 w-full rounded-2" : "h-48 w-full rounded-2"}
        label="Gaugeworks pin screen"
        onDent={(col, row) => setDent([col, row])}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="w-full max-w-3xl">{toy}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Studio · desk toy
        </p>
        <p className="text-sm font-medium text-foreground">
          A pin screen that keeps the shape of the sea
        </p>
      </div>
      {toy}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {dent ? (
          <>
            <span className="text-signal">dent pushed</span> · column {dent[0]},
            row {dent[1]}
          </>
        ) : (
          <>
            <span className="text-signal">swell rolling</span> · press to leave
            a mark
          </>
        )}
      </p>
    </div>
  );
}
