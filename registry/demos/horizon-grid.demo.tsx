"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HorizonGrid } from "@/registry/ui/horizon-grid";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 3,
    step: 0.1,
  },
  density: {
    kind: "range",
    label: "Density",
    default: 14,
    min: 6,
    max: 30,
    step: 1,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "var(--foreground)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "var(--foreground)": "Pearl",
    },
  },
});

/**
 * Waylight Maps' landing hero: the line sits in the sky over a floor that
 * runs to the horizon, the camera leaning toward the visitor's hand and a
 * ring of light opening on the floor wherever they press.
 */
export function HorizonGridDemo({
  chrome = true,
  // The floor is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leaning, setLeaning] = React.useState(false);
  const [rings, setRings] = React.useState(0);
  const [ringing, setRinging] = React.useState(false);
  const density = values.density ?? 14;
  const speed = values.speed ?? 1;

  // The ring has opened across the floor by the time this fires.
  React.useEffect(() => {
    if (rings === 0) return;
    const done = window.setTimeout(() => setRinging(false), 1000);
    return () => window.clearTimeout(done);
  }, [rings]);

  const floor = (
    <HorizonGrid
      horizon={chrome ? 0.6 : 0.56}
      onActiveChange={setLeaning}
      onPulse={() => {
        setRinging(true);
        setRings((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col items-center p-5 text-center @lg:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Waylight Maps
          </p>
          <p className="mt-1.5 max-w-64 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            The long way, mapped
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Plan a route
              </button>
              <span className="text-xs text-ink-2">
                Routes to the edge of the plain
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </HorizonGrid>
  );

  if (!chrome) return <div className="flex w-full">{floor}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {floor}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ringing ? (
          <>
            <span className="text-signal">ring</span> · light opens on the floor
          </>
        ) : leaning ? (
          <>
            <span className="text-signal">leaning</span> · the camera turns to
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{density} lines</span> · speed{" "}
            {speed.toFixed(1)}
          </>
        )}
      </p>
    </div>
  );
}
