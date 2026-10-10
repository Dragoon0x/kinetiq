"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KelpStrands } from "@/registry/ui/kelp-strands";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Strands",
    default: 28,
    min: 8,
    max: 60,
    step: 2,
  },
  current: {
    kind: "range",
    label: "Current",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks' marine reserve: a kelp bed swaying behind the dive offer,
 * parting wherever the visitor's hand passes through it.
 */
export function KelpStrandsDemo({
  chrome = true,
  // The kelp is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [held, setHeld] = React.useState(false);
  const [lit, setLit] = React.useState<string | null>(null);
  const current = values.current ?? tweaks.current.default;

  const scene = (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) {
          setLit(event.target.textContent ?? null);
        }
      }}
      onBlur={() => setLit(null)}
      className="w-full"
    >
      <KelpStrands
        className="h-52 w-full rounded-3 border border-hairline bg-card"
        {...values}
      >
        <div className="absolute top-3 left-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-2 border border-hairline bg-card p-3 shadow-[0_10px_30px_-18px_color-mix(in_oklab,black_60%,transparent)]">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks · kelp survey
          </p>
          <p className="text-base leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
            Slow water, long light.
          </p>
          <button
            type="button"
            className="inline-flex h-8 w-fit items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Plan a dive
          </button>
        </div>
      </KelpStrands>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-2xl">{scene}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lit ? (
          <>
            <span className="text-signal">parting for</span> · {lit}
          </>
        ) : held ? (
          <>
            <span className="text-signal">wake behind you</span> · the strands
            part and spring back
          </>
        ) : (
          <>
            <span className="text-signal">
              {current > 0 ? `current ${current.toFixed(2)}` : "still water"}
            </span>{" "}
            · pass through the strands
          </>
        )}
      </p>
    </div>
  );
}
