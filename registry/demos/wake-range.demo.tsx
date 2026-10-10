"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WakeRange } from "@/registry/ui/wake-range";

export const tweaks = defineTweaks({
  wake: {
    kind: "range",
    label: "Wake",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  steps: {
    kind: "range",
    label: "Steps",
    default: 6,
    min: 0,
    max: 12,
    step: 2,
  },
  fill: { kind: "toggle", label: "Fill", default: true },
});

const DISTANCE = 24;

const knots = (v: number) =>
  `${Number.isInteger(v) ? v : Number(v.toFixed(1))} kn`;

const eta = (speed: number) => {
  const minutes = Math.round((DISTANCE / Math.max(0.1, speed)) * 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
};

/**
 * Waylight Sail's passage planner: the cruising speed for a 24-mile run to
 * Coldbrook Point, set on a slider that leaves a wake.
 */
export function WakeRangeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [speed, setSpeed] = React.useState(8);
  const [moving, setMoving] = React.useState(false);

  const planner = (
    <div className="flex w-full flex-col gap-3 rounded-4 border border-hairline bg-card p-4">
      <WakeRange
        label="Cruising speed"
        min={2}
        max={14}
        step={0.5}
        value={speed}
        onValueChange={(v) => {
          setSpeed(v);
          setMoving(true);
        }}
        onValueCommit={() => setMoving(false)}
        format={knots}
        sound={sound}
        {...values}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>{DISTANCE} nm to Coldbrook Point</span>
        <span className="text-ink-2 tabular-nums">arrive in {eta(speed)}</span>
      </div>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-md justify-center">{planner}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {planner}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {moving ? "under way" : knots(speed)}
        </span>
        {` · eta ${eta(speed)}`}
      </p>
    </div>
  );
}
