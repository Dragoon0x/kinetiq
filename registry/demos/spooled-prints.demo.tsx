"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SpooledPrints,
  defaultSpooledPrintsItems,
} from "@/registry/ui/spooled-prints";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 12,
    min: 0,
    max: 24,
    step: 1,
    unit: "°",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  spools: {
    kind: "range",
    label: "Spools",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
});

/**
 * Fernworks Press proof rolls: the season's prints wound between spools on
 * the drying line, browsed as the page goes by.
 */
export function SpooledPrintsDemo({
  chrome = true,
  // The rolls are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState<number | null>(null);

  const kicker = (
    <p className="truncate text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
      Fernworks Press · Proof rolls
    </p>
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col gap-2" style={{ height: 548 }}>
        {kicker}
        <SpooledPrints
          value={open}
          onValueChange={setOpen}
          className="w-full flex-1"
          {...values}
        />
      </div>
    );
  }

  const rolls = Math.round(values.spools ?? tweaks.spools.default);
  const total = defaultSpooledPrintsItems.length;
  const shown = open !== null ? defaultSpooledPrintsItems[open] : undefined;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {kicker}
      <SpooledPrints
        value={open}
        onValueChange={setOpen}
        className="h-[30rem] w-full"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {rolls} {rolls === 1 ? "roll" : "rolls"} · {total} prints
        </span>{" "}
        · {shown ? `viewing ${shown.caption ?? shown.alt}` : "scroll to wind"}
      </p>
    </div>
  );
}
