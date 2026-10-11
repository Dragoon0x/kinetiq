"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AnaglyphCard } from "@/registry/ui/anaglyph-card";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  channels: {
    kind: "choice",
    label: "Channels",
    default: "red-cyan",
    options: ["red-cyan", "red-blue", "green-magenta", "amber-blue"],
    names: {
      "red-cyan": "Red·Cyan",
      "red-blue": "Red·Blue",
      "green-magenta": "Grn·Mag",
      "amber-blue": "Amb·Blue",
    },
  },
});

function Caption() {
  return (
    <>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks · field notes
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">
        Lake 7 at dusk, 21:04
      </p>
    </>
  );
}

/**
 * Fernworks Field Notes: a plate from the lake survey, printed for red and
 * cyan glasses. Lean in to see the depth; press it to put the glasses on.
 */
export function AnaglyphCardDemo({
  chrome = true,
  // The card is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [glasses, setGlasses] = React.useState(false);

  if (!chrome) {
    return (
      <div className="flex w-full justify-center">
        <AnaglyphCard
          pressed={glasses}
          onPressedChange={setGlasses}
          {...values}
        >
          <Caption />
        </AnaglyphCard>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <AnaglyphCard
        pressed={glasses}
        onPressedChange={setGlasses}
        className="self-center"
        {...values}
      >
        <Caption />
      </AnaglyphCard>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {glasses ? (
          <>
            <span className="text-signal">glasses on</span> · parallax only
          </>
        ) : (
          <>
            <span className="text-signal">split</span> · near reeds fringe most
          </>
        )}
      </p>
    </div>
  );
}
