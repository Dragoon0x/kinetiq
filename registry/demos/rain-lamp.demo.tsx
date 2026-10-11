"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RainLamp } from "@/registry/ui/rain-lamp";

export const tweaks = defineTweaks({
  filaments: {
    kind: "range",
    label: "Threads",
    default: 14,
    min: 6,
    max: 24,
    step: 1,
  },
  dripRate: {
    kind: "range",
    label: "Drip rate",
    default: 0.5,
    min: 0.1,
    max: 1.5,
    step: 0.1,
    unit: "/s",
  },
  glow: {
    kind: "choice",
    label: "Glow",
    default: "amber",
    options: ["amber", "rose", "violet", "teal"],
    names: { amber: "Amber", rose: "Rose", violet: "Violet", teal: "Teal" },
  },
});

/**
 * Basinworks' rain lamp reissue: the product card's picture is the lamp
 * itself, raining in a dim room.
 */
export function RainLampDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [plucked, setPlucked] = React.useState<number | null>(null);
  const calm = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (calm.current !== null) window.clearTimeout(calm.current);
    },
    [],
  );

  const onPluck = (thread: number) => {
    setPlucked(thread);
    if (calm.current !== null) window.clearTimeout(calm.current);
    calm.current = window.setTimeout(() => setPlucked(null), 1400);
  };

  if (!chrome) {
    return (
      <div className="flex w-full">
        <RainLamp
          className="h-[540px] w-full rounded-3"
          sound={sound}
          onPluck={onPluck}
          {...values}
        />
      </div>
    );
  }

  const threads = values.filaments ?? 14;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-col overflow-clip rounded-3 border border-hairline bg-card">
        <RainLamp
          className="h-80 w-full"
          label="Rain lamp, 1972 reissue"
          sound={sound}
          onPluck={onPluck}
          {...values}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Basinworks · Lighting
            </p>
            <p className="text-base leading-snug font-semibold text-foreground">
              Rain Lamp, 1972 reissue
            </p>
            <p className="text-sm leading-snug text-ink-2">
              Mineral oil on nylon threads, a brass fern, a warm bulb.
            </p>
          </div>
          <p className="font-mono text-sm text-foreground tabular-nums">
            $240.00
          </p>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {plucked === null ? (
          <>
            <span className="text-signal">raining</span> · {threads} threads ·
            sweep across them to pluck
          </>
        ) : (
          <>
            <span className="text-signal">thread {plucked + 1} plucked</span> ·
            drops stall, then run on
          </>
        )}
      </p>
    </div>
  );
}
