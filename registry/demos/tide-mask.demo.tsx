"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TideMask } from "@/registry/ui/tide-mask";

export const tweaks = defineTweaks({
  amplitude: {
    kind: "range",
    label: "Amplitude",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 140,
    min: 0,
    max: 400,
    step: 20,
    unit: "ms",
  },
});

const LINES = ["Every river,", "read as it rises."];

/**
 * Basinworks' tide and flood data service: the landing heading comes up out
 * of the water a line at a time, and the last ripple stays as its underline.
 */
export function TideMaskDemo({
  chrome = true,
  // The water is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  // A tweak raises the heading again, so its effect is seen at once.
  const runKey = `${take}:${values.amplitude}:${values.speed}:${values.stagger}`;
  const [risenKey, setRisenKey] = React.useState<string | null>(null);
  const risen = risenKey === runKey;

  const heading = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks · tide and flood data
      </p>
      <TideMask
        key={runKey}
        text={LINES}
        onComplete={() => setRisenKey(runKey)}
        className="text-[clamp(28px,9.4cqi,54px)] leading-[1.06] font-semibold tracking-[-0.025em] text-foreground"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{heading}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {heading}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {risen ? (
            <>
              <span className="text-signal">risen</span> · hover to stir the
              waterline
            </>
          ) : (
            <>
              <span className="text-signal">rising</span> · {LINES.length} lines
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setTake((t) => t + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
