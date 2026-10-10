"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StarSpiral, type StarTilt } from "@/registry/ui/star-spiral";

export const tweaks = defineTweaks({
  arms: {
    kind: "range",
    label: "Arms",
    default: 2,
    min: 1,
    max: 6,
    step: 1,
  },
  stars: {
    kind: "range",
    label: "Stars",
    default: 1400,
    min: 300,
    max: 3000,
    step: 100,
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 55,
    min: 0,
    max: 80,
    step: 5,
    unit: "°",
  },
});

/**
 * Fernworks Observatory's open nights: the line sits beside a galaxy the
 * visitor can tip in their hand and set rippling with new stars.
 */
export function StarSpiralDemo({
  chrome = true,
  // The galaxy is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tilting, setTilting] = React.useState(false);
  const [angle, setAngle] = React.useState<StarTilt | null>(null);
  const [rings, setRings] = React.useState(0);
  const [ringing, setRinging] = React.useState(false);
  const arms = Math.round(values.arms ?? 2);
  const stars = Math.round(values.stars ?? 1400);
  const tilt = Math.round(values.tilt ?? 55);

  // The ring has crossed the disk by the time this fires.
  React.useEffect(() => {
    if (rings === 0) return;
    const done = window.setTimeout(() => setRinging(false), 1400);
    return () => window.clearTimeout(done);
  }, [rings]);

  const galaxy = (
    <StarSpiral
      originX={0.68}
      onActiveChange={setTilting}
      onTiltChange={setAngle}
      onRing={() => {
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
        <div className="flex size-full flex-col items-start justify-end p-5 text-left @lg:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Fernworks Observatory
          </p>
          <p className="mt-1.5 max-w-56 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            Open nights, every new moon
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Reserve a scope
              </button>
              <span className="text-xs text-ink-2">Twelve on the ridge</span>
            </div>
          ) : null}
        </div>
      </div>
    </StarSpiral>
  );

  if (!chrome) return <div className="flex w-full">{galaxy}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {galaxy}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {tilting && angle ? (
          <>
            <span className="text-signal">tilting</span> · {angle.y}° by{" "}
            {angle.x}°
          </>
        ) : ringing ? (
          <>
            <span className="text-signal">ring</span> · a wave through the disk
          </>
        ) : (
          <>
            <span className="text-signal">
              {arms} {arms === 1 ? "arm" : "arms"}
            </span>{" "}
            · {stars} stars · tilt {tilt}°
          </>
        )}
      </p>
    </div>
  );
}
