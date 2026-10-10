"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StaticFuzz } from "@/registry/ui/static-fuzz";

export const tweaks = defineTweaks({
  intensity: {
    kind: "range",
    label: "Intensity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  bands: {
    kind: "range",
    label: "Bands",
    default: 2,
    min: 0,
    max: 6,
    step: 0.5,
    unit: "/10s",
  },
  calm: {
    kind: "range",
    label: "Calm",
    default: 2.5,
    min: 0,
    max: 8,
    step: 0.5,
    unit: "em",
  },
});

/**
 * Coldbrook Radio's night service: the headline comes in like a far station
 * at two in the morning, and steadies under the reader's hand.
 */
export function StaticFuzzDemo({
  chrome = true,
  // The signal is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [steady, setSteady] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook 88.4 · after hours
      </p>
      <StaticFuzz
        as="h2"
        text="Late signal from the coast"
        focusable
        onCalmChange={setSteady}
        className="-mx-[0.28em] text-[clamp(1.6rem,7cqi,3.25rem)] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground"
        {...values}
      />
      <p className="text-sm text-ink-2">Tune in from midnight, all night.</p>
      {chrome ? (
        <p
          role="status"
          className="mt-1 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {steady ? (
            <>
              <span className="text-signal">signal steady</span> · clear
              reception
            </>
          ) : (
            <>
              <span className="text-signal">signal frayed</span> ·{" "}
              {motionSafe ? "hover the words to steady them" : "hover to clear"}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
