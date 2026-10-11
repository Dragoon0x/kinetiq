"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PaceBoard } from "@/registry/ui/pace-board";

export const tweaks = defineTweaks({
  blur: {
    kind: "range",
    label: "Blur",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  interval: {
    kind: "range",
    label: "Interval",
    default: 2400,
    min: 800,
    max: 5000,
    step: 200,
    unit: "ms",
  },
  overshoot: {
    kind: "range",
    label: "Overshoot",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const AUDIENCES = ["teams", "night shifts", "the long haul", "you"];

/** A seeded trickle of riders crossing the start line. */
function useRiders(start: number) {
  const [riders, setRiders] = React.useState(start);
  React.useEffect(() => {
    let seed = 0x5eed;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      setRiders((n) => n + 1 + (seed % 7));
    }, 1700);
    return () => window.clearInterval(id);
  }, []);
  return riders;
}

/**
 * Gaugeworks' ride-telemetry landing: the audience swaps at speed in the
 * headline while the count of riders on course ticks only its changed digits.
 */
export function PaceBoardDemo({
  chrome = true,
  // The board is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const riders = useRiders(1284);
  const every = (values.interval ?? 2400) / 1000;

  const copy = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · Ride telemetry
      </p>
      <h2 className="text-xl leading-tight font-semibold tracking-tight text-foreground @[34rem]:text-3xl">
        Built for{" "}
        <PaceBoard
          values={AUDIENCES}
          index={index}
          onIndexChange={setIndex}
          onPausedChange={setHeld}
          label="Audience"
          progress
          className="text-cobalt-bright"
          {...values}
        />
      </h2>
      <p className="text-sm text-ink-2">
        <PaceBoard
          value={riders}
          swap="chars"
          from="auto"
          className="font-mono text-foreground tabular-nums"
          blur={values.blur}
          overshoot={values.overshoot}
        />{" "}
        riders on course right now
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{copy}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className={cn("rounded-3 border border-hairline bg-card p-5")}>
        {copy}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{AUDIENCES[index]}</span>
        {held
          ? " · paused · space resumes"
          : ` · ${index + 1} of ${AUDIENCES.length} · every ${every.toFixed(1)} s`}
      </p>
    </div>
  );
}
