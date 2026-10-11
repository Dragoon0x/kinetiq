"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AsciiHearth, type AsciiHearthLevel } from "@/registry/ui/ascii-hearth";

export const tweaks = defineTweaks({
  heat: {
    kind: "range",
    label: "Heat",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  charRamp: {
    kind: "choice",
    label: "Ramp",
    default: "classic",
    options: ["classic", "blocks", "dots"],
    names: { classic: "Classic", blocks: "Blocks", dots: "Dots" },
  },
  draught: {
    kind: "range",
    label: "Draught",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const LINES: Record<AsciiHearthLevel, [string, string]> = {
  embers: ["banked to embers", "fan it back"],
  low: ["burning low", "move across it to fan"],
  steady: ["fire steady", "move across it to fan"],
  roaring: ["roaring", "the bellows are working"],
};

/**
 * Fernworks Lodge, cabin 4: the wood stove on the booking page, lit and
 * waiting, banking down to embers if nobody tends it.
 */
export function AsciiHearthDemo({
  chrome = true,
  // The fire is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [level, setLevel] = React.useState<AsciiHearthLevel>("steady");

  const hearth = (
    <AsciiHearth
      label="Cabin 4 stove"
      onLevelChange={setLevel}
      className={
        chrome
          ? "h-56 w-full rounded-3 border border-hairline bg-card"
          : "h-52 w-full rounded-3 border border-hairline bg-card"
      }
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{hearth}</div>;

  const [lead, rest] = LINES[level];
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Lodge · cabin 4
          </p>
          <p className="text-base font-medium text-foreground">
            Wood stove, kindling by the door
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px] text-ink-3">
          sleeps 2 · from 120
        </p>
      </div>
      {hearth}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{lead}</span> · {rest}
      </p>
    </div>
  );
}
