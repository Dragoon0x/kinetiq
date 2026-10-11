"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  StreakPager,
  defaultStreakPagerItems,
} from "@/registry/ui/streak-pager";

export const tweaks = defineTweaks({
  streak: {
    kind: "range",
    label: "Streak",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Tint",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "var(--danger)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Signal",
      "var(--warn)": "Amber",
      "var(--danger)": "Ember",
    },
  },
  parallax: {
    kind: "range",
    label: "Parallax",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * The Waylight Survey: four places worth the long way round, one slide each,
 * on a sky that streaks as you travel between them.
 */
export function StreakPagerDemo({
  chrome = true,
  // The pager is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [moving, setMoving] = React.useState(false);
  const title = defaultStreakPagerItems[index]?.title ?? "";

  const pager = (
    <StreakPager
      label="Waylight survey"
      className={chrome ? "h-60" : "h-[216px]"}
      value={index}
      onValueChange={(i) => {
        setIndex(i);
        setMoving(true);
      }}
      onLand={() => setMoving(false)}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{pager}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Waylight Survey</p>
        <p className="text-xs text-ink-3">Four places worth the long way</p>
      </div>
      {pager}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {moving ? "in transit" : `slide ${index + 1} of 4`}
        </span>
        {` · ${title}`}
      </p>
    </div>
  );
}
