"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HalftoneWake } from "@/registry/ui/halftone-wake";

export const tweaks = defineTweaks({
  cell: {
    kind: "range",
    label: "Cell",
    default: 10,
    min: 6,
    max: 20,
    step: 1,
    unit: "px",
  },
  angle: {
    kind: "range",
    label: "Angle",
    default: 45,
    min: 0,
    max: 90,
    step: 5,
    unit: "°",
  },
  linger: {
    kind: "range",
    label: "Linger",
    default: 2.4,
    min: 0.4,
    max: 6,
    step: 0.2,
    unit: "s",
  },
});

/**
 * Basinworks Press, plate 07: a ridge line at evening that only prints where
 * the reader's hand has passed, then sinks back into the paper.
 */
export function HalftoneWakeDemo({
  chrome = true,
  // The press is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [printed, setPrinted] = React.useState(0);
  const linger = values.linger ?? tweaks.linger.default;

  const plate = (
    <div className="relative w-full overflow-clip rounded-3 border border-hairline bg-card">
      <HalftoneWake
        alt="Basinworks Press plate 07: a low sun behind layered mountain ridges"
        onCoverageChange={setPrinted}
        className={chrome ? "aspect-auto h-60 sm:h-72" : "aspect-auto h-52"}
        {...values}
      />
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-1 bg-card/85 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks Press · plate 07
      </p>
    </div>
  );

  if (!chrome) return <div className="w-full max-w-2xl">{plate}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {plate}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {!motionSafe ? (
          <>
            <span className="text-signal">printed</span> · the full plate, held
            still
          </>
        ) : printed > 0.01 ? (
          <>
            <span className="text-signal">{Math.round(printed * 100)}%</span>{" "}
            printed · the wake recedes in {linger.toFixed(1)} s
          </>
        ) : (
          <>
            <span className="text-signal">ghost</span> · move across the plate
            or tab in
          </>
        )}
      </p>
    </div>
  );
}
