"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BullseyePanes } from "@/registry/ui/bullseye-panes";

export const tweaks = defineTweaks({
  roundels: {
    kind: "range",
    label: "Roundels",
    default: 8,
    min: 4,
    max: 14,
    step: 1,
  },
  swirl: {
    kind: "range",
    label: "Swirl",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lead: {
    kind: "range",
    label: "Lead",
    default: 3,
    min: 1,
    max: 8,
    step: 0.5,
    unit: "px",
  },
});

/**
 * Waylight Glassworks: a hero for their hand-spun crown glass, the garden
 * outside seen through a leaded window whose swirls turn with the pointer.
 */
export function BullseyePanesDemo({
  chrome = true,
  // The window is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const across = values.roundels ?? 8;
  const swirl = values.swirl ?? 0.6;

  const pane = (
    <BullseyePanes
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-3 sm:p-4">
        <div className="max-w-60 rounded-3 border border-hairline bg-background/85 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · crown glass
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-balance text-foreground">
            Spun by hand, leaded by eye.
          </p>
        </div>
      </div>
    </BullseyePanes>
  );

  if (!chrome) return <div className="flex w-full">{pane}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {pane}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{across} across</span> · swirl{" "}
        {swirl.toFixed(2)} · move to turn the glass
      </p>
    </div>
  );
}
