"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CatenaryGlow } from "@/registry/ui/catenary-glow";

export const tweaks = defineTweaks({
  wires: {
    kind: "range",
    label: "Wires",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  sag: {
    kind: "range",
    label: "Sag",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.65,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Grid's evening hero: the north feeder at dusk, the current
 * running down each line in turn as the town comes on.
 */
export function CatenaryGlowDemo({
  chrome = true,
  // The lines are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plucked, setPlucked] = React.useState<number | null>(null);
  const lines = Math.round(values.wires ?? tweaks.wires.default);

  const caption = (
    <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-primary-foreground/85 uppercase">
      <span className="truncate">Fieldline Grid · north feeder</span>
      <span className="shrink-0 tabular-nums">4.2 GW</span>
    </div>
  );

  if (!chrome) {
    return (
      <div className="flex w-full">
        <CatenaryGlow
          label="Fieldline north feeder at dusk"
          className="h-52 w-full"
          {...values}
        >
          {caption}
        </CatenaryGlow>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Grid · evening load
        </p>
        <p className="text-base font-medium text-foreground">
          The town comes on at dusk
        </p>
      </div>
      <CatenaryGlow
        label="Fieldline north feeder at dusk"
        onPluck={setPlucked}
        className="h-60 w-full"
        {...values}
      >
        {caption}
      </CatenaryGlow>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {plucked === null ? `${lines} lines` : `line ${plucked + 1} swaying`}
        </span>{" "}
        · brush or tap a wire
      </p>
    </div>
  );
}
