"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GrainGather } from "@/registry/ui/grain-gather";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  radius: {
    kind: "range",
    label: "Radius",
    default: 56,
    min: 20,
    max: 120,
    step: 4,
    unit: "px",
  },
  scatter: {
    kind: "range",
    label: "Scatter",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks' studio pottery: the landing headline is poured from fine clay
 * grains that gather into the words, and part under the visitor's hand.
 */
export function GrainGatherDemo({
  chrome = true,
  // The sand is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [take, setTake] = React.useState(0);
  const [settledTake, setSettledTake] = React.useState<number | null>(null);
  const gathered = settledTake === take;

  // The eyebrow sits in a box at the headline's size, so its inset is the
  // same 0.2em the sand keeps around the words.
  const size = "text-[clamp(30px,10.4cqi,60px)]";
  const headline = (
    <div className="@container flex w-full flex-col gap-1">
      <div className={`${size} px-[0.2em] leading-none`}>
        <p className="font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
          Fernworks · studio pottery
        </p>
      </div>
      <GrainGather
        key={take}
        text="Thrown from river clay"
        onComplete={() => setSettledTake(take)}
        className={`${size} leading-[1.05] font-bold tracking-[-0.03em] text-balance text-foreground`}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{headline}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {headline}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {gathered ? (
            <>
              <span className="text-signal">gathered</span> · move through the
              sand · press to scatter
            </>
          ) : (
            <>
              <span className="text-signal">gathering</span> · the grains are
              settling
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setTake((t) => t + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Pour again
        </button>
      </div>
    </div>
  );
}
