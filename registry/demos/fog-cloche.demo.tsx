"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FogCloche } from "@/registry/ui/fog-cloche";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  swirl: {
    kind: "range",
    label: "Swirl",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spill: {
    kind: "range",
    label: "Spill",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  light: {
    kind: "range",
    label: "Light",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const GATHER = 2600;

/**
 * Fernworks Terrarium: moss no. 4, kept under a glass of its own fog — lift
 * it and watch the fog roll out across the shelf.
 */
export function FogClocheDemo({
  chrome = true,
  // The fog is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lifted, setLifted] = React.useState(false);
  const [gathering, setGathering] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const cloche = (
    <FogCloche
      label="Moss cloche"
      className={chrome ? "h-60" : "h-[216px]"}
      lifted={lifted}
      gather={GATHER}
      onLiftedChange={(up) => {
        setLifted(up);
        if (timer.current !== null) window.clearTimeout(timer.current);
        setGathering(!up);
        if (!up) {
          timer.current = window.setTimeout(() => setGathering(false), GATHER);
        }
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{cloche}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          Fernworks Terrarium
        </p>
        <p className="text-xs text-ink-3">Moss no. 4, under glass</p>
      </div>
      {cloche}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {lifted ? "lifted" : gathering ? "gathering" : "under glass"}
        </span>
        {lifted
          ? " · fog spilling across the shelf"
          : gathering
            ? " · fog rising from the moss"
            : " · press to lift the glass"}
      </p>
    </div>
  );
}
