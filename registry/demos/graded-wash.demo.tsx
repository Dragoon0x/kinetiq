"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GradedWash, type GradedWashState } from "@/registry/ui/graded-wash";

export const tweaks = defineTweaks({
  wetness: {
    kind: "range",
    label: "Wetness",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 12,
    min: 0,
    max: 30,
    step: 1,
    unit: "°",
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "dusk",
    options: ["dusk", "tide", "ember", "moss"],
    names: { dusk: "Dusk", tide: "Tide", ember: "Ember", moss: "Moss" },
  },
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const CONTROL =
  "inline-flex h-8 items-center gap-2 rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Fernworks Atelier: an evening sky laid as a graded wash, one colour
 * pulled down into the other on a tilted board.
 */
export function GradedWashDemo({
  chrome = true,
  // The wash is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<GradedWashState>("ready");
  const [stroke, setStroke] = React.useState(0);
  const [washKey, setWashKey] = React.useState(0);
  const tilt = values.tilt ?? 12;

  const board = (
    <GradedWash
      label="Evening sky"
      className={chrome ? "h-60" : "h-[216px]"}
      washKey={washKey}
      onStateChange={(s, n) => {
        setPhase(s);
        setStroke(n);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{board}</div>;

  const said =
    phase === "painting"
      ? `stroke ${Math.min(7, stroke + 1)} of 7`
      : phase === "drying"
        ? "drying"
        : phase === "dry"
          ? "dry"
          : "ready";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Fernworks Atelier</p>
        <p className="text-xs text-ink-3">Evening sky, a graded wash</p>
      </div>
      {board}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{said}</span>
          {` · tilt ${tilt}° · drag to tip the board`}
        </p>
        <button
          type="button"
          onClick={() => setWashKey((k) => k + 1)}
          className={CONTROL}
        >
          New wash
        </button>
      </div>
    </div>
  );
}
