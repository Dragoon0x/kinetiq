"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ThreadHourglass } from "@/registry/ui/thread-hourglass";

export const tweaks = defineTweaks({
  threadCount: {
    kind: "range",
    label: "Threads",
    default: 48,
    min: 12,
    max: 96,
    step: 4,
  },
  twist: {
    kind: "range",
    label: "Twist limit",
    default: 150,
    min: 60,
    max: 175,
    step: 5,
    unit: "°",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight's breathing room: twist the top hoop as you breathe in, let go as
 * you breathe out, and the sculpture unwinds with you.
 */
export function ThreadHourglassDemo({
  chrome = true,
  // The sculpture is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [twisted, setTwisted] = React.useState(0);
  const [holding, setHolding] = React.useState(false);
  const threads = values.threadCount ?? tweaks.threadCount.default;
  const limit = values.twist ?? tweaks.twist.default;
  const waist = Math.round(Math.cos((Math.abs(twisted) * Math.PI) / 360) * 100);

  const panel = (
    <div
      className="relative w-full overflow-clip rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 420 : 500 }}
    >
      <ThreadHourglass
        onTwistChange={setTwisted}
        onHoldChange={setHolding}
        {...values}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-1 p-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight · breathing room
        </p>
        <p className="text-sm leading-snug font-medium text-foreground">
          Twist in, let go out
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{panel}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {holding ? (
          <>
            <span className="text-signal">twisted {Math.abs(twisted)}°</span> ·
            waist {waist}% of the hoop
          </>
        ) : twisted !== 0 ? (
          <>
            <span className="text-signal">left at {Math.abs(twisted)}°</span> ·
            waist {waist}% of the hoop
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {threads} threads,
            twist up to {limit}°
          </>
        )}
      </p>
    </div>
  );
}
