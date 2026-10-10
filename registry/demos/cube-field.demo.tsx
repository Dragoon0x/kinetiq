"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CubeField } from "@/registry/ui/cube-field";

export const tweaks = defineTweaks({
  grid: {
    kind: "range",
    label: "Grid",
    default: 48,
    min: 32,
    max: 72,
    step: 4,
    unit: "px",
  },
  rise: {
    kind: "range",
    label: "Rise",
    default: 36,
    min: 8,
    max: 72,
    step: 4,
    unit: "px",
  },
  falloff: {
    kind: "range",
    label: "Falloff",
    default: 3.5,
    min: 1.5,
    max: 8,
    step: 0.5,
  },
});

/**
 * Gaugeworks site surveys: the hero band is a floor of cubes that rises
 * under the visitor's hand and rings when they press it.
 */
export function CubeFieldDemo({
  chrome = true,
  // The floor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [inside, setInside] = React.useState(false);
  const [waves, setWaves] = React.useState(0);
  const [raised, setRaised] = React.useState<string | null>(null);

  const scene = (
    <div
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setInside(true);
      }}
      onPointerLeave={() => setInside(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) {
          setRaised(event.target.textContent ?? null);
        }
      }}
      onBlur={() => setRaised(null)}
      className="w-full"
    >
      <CubeField
        onWave={() => setWaves((n) => n + 1)}
        className="h-52 w-full rounded-3 border border-hairline bg-card"
        {...values}
      >
        <div className="absolute bottom-3 left-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-2 border border-hairline bg-card p-3 shadow-[0_10px_30px_-18px_color-mix(in_oklab,black_60%,transparent)]">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks · site survey
          </p>
          <p className="text-base leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
            Build on solid ground.
          </p>
          <button
            type="button"
            className="inline-flex h-8 w-fit items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Start a survey
          </button>
        </div>
      </CubeField>
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
        {raised ? (
          <>
            <span className="text-signal">raised under</span> · {raised}
          </>
        ) : waves > 0 ? (
          <>
            <span className="text-signal">wave sent</span> · {waves} so far
          </>
        ) : inside ? (
          <>
            <span className="text-signal">rising to meet you</span> · click to
            send a wave
          </>
        ) : (
          <>
            <span className="text-signal">floor at rest</span> · move across it,
            click to send a wave
          </>
        )}
      </p>
    </div>
  );
}
