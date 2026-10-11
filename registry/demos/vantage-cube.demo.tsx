"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  VantageCube,
  defaultVantageCubeWords,
} from "@/registry/ui/vantage-cube";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lag: {
    kind: "range",
    label: "Lag",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  edges: { kind: "toggle", label: "Edges", default: true },
});

/**
 * Fieldline field notes: four words hidden in a cube of loose type, each one
 * legible from its own angle.
 */
export function VantageCubeDemo({
  chrome = true,
  // The cube is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [locks, setLocks] = React.useState(0);
  const word = defaultVantageCubeWords[index]?.text.toLowerCase() ?? "";

  const cube = (
    <VantageCube
      label="Fieldline word cube"
      className={chrome ? "h-60" : "h-[208px]"}
      value={index}
      onValueChange={setIndex}
      onLock={() => setLocks((n) => n + 1)}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{cube}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Fieldline</p>
        <p className="text-xs text-ink-3">Field notes, from the right angle</p>
      </div>
      {cube}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">locked · {word}</span>
        {` · word ${index + 1} of 4 · ${locks} ${locks === 1 ? "lock" : "locks"}`}
      </p>
    </div>
  );
}
