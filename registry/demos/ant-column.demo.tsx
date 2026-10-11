"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AntColumn } from "@/registry/ui/ant-column";

export const tweaks = defineTweaks({
  ants: {
    kind: "range",
    label: "Ants",
    default: 140,
    min: 20,
    max: 400,
    step: 20,
  },
  pheromone: {
    kind: "range",
    label: "Pheromone",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pixel: {
    kind: "range",
    label: "Pixel",
    default: 3,
    min: 2,
    max: 6,
    step: 1,
    unit: "px",
  },
});

/**
 * Fernworks field kitchen: a colony works the ground under a small card that
 * it routes round, carrying crumbs home to its nest.
 */
export function AntColumnDemo({
  chrome = true,
  // The colony is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [home, setHome] = React.useState(0);

  const colony = (
    <AntColumn
      onCarry={setHome}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline bg-card"
          : "h-52 rounded-3 border border-hairline bg-card"
      }
      {...values}
    >
      <div className="flex size-full items-end justify-end p-3">
        <div
          data-obstacle=""
          className="max-w-44 rounded-3 border border-hairline bg-background/90 px-3 py-2"
        >
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks · field kitchen
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
            Every crumb finds its way home.
          </p>
        </div>
      </div>
    </AntColumn>
  );

  if (!chrome) return <div className="flex w-full">{colony}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {colony}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {home === 1 ? "1 bit carried home" : `${home} bits carried home`}
        </span>{" "}
        · click to drop a crumb
      </p>
    </div>
  );
}
