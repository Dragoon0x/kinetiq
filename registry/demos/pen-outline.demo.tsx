"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PenOutline, type PenOutlinePhase } from "@/registry/ui/pen-outline";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  stroke: {
    kind: "range",
    label: "Stroke",
    default: 1.25,
    min: 0.5,
    max: 3,
    step: 0.25,
    unit: "px",
  },
  flood: {
    kind: "range",
    label: "Flood",
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const STATUS: Record<PenOutlinePhase, [string, string]> = {
  waiting: ["waiting", "the nib is ready"],
  drawing: ["drawing", "the nib is writing"],
  flooding: ["flooding", "ink rising"],
  inked: ["inked", "press the headline to redraw"],
};

/**
 * Fernworks' bottled ink: the headline of its No. 4 page is written by the
 * nib it sells, then flooded with the ink.
 */
export function PenOutlineDemo({
  chrome = true,
  // The pen writes in silence: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<PenOutlinePhase>("waiting");
  const [label, detail] = STATUS[phase];

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks · bottled ink no. 4
      </p>
      <PenOutline
        as="h2"
        text="Written by hand"
        onPhaseChange={setPhase}
        className="text-[clamp(2rem,12.5cqw,5.25rem)] leading-[1.08] font-semibold tracking-tight text-foreground"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{label}</span> · {detail}
        </p>
      ) : null}
    </div>
  );
}
