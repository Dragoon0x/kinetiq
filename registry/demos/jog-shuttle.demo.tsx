"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { JogShuttle } from "@/registry/ui/jog-shuttle";

export const tweaks = defineTweaks({
  detents: {
    kind: "range",
    label: "Detents",
    default: 24,
    min: 12,
    max: 48,
    step: 4,
  },
  inertia: {
    kind: "range",
    label: "Inertia",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shuttleMax: {
    kind: "range",
    label: "Shuttle max",
    default: 16,
    min: 4,
    max: 32,
    step: 4,
    unit: "×",
  },
  spring: {
    kind: "range",
    label: "Spring",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** Two and a half minutes at 24 frames a second. */
const LAST_FRAME = 3599;

/**
 * Trimming a take in Fieldline Cut: jog the wheel a frame at a time to find
 * the cut, or twist the ring (or press J, K, L) to fly through the take.
 */
export function JogShuttleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [frame, setFrame] = React.useState(1733);
  const [speed, setSpeed] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <JogShuttle
        label="Interview, take 3"
        fps={24}
        max={LAST_FRAME}
        value={frame}
        onValueChange={setFrame}
        onSpeedChange={setSpeed}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {speed === 0 ? (
            <>
              <span className="text-signal">paused</span> · jog for frames, j k
              l to shuttle
            </>
          ) : (
            <>
              <span className="text-signal">
                {speed > 0 ? "forward" : "reverse"} {Math.abs(speed)}×
              </span>{" "}
              · k to stop
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
