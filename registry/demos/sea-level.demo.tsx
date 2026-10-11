"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SeaLevel } from "@/registry/ui/sea-level";

export const tweaks = defineTweaks({
  waveHeight: {
    kind: "range",
    label: "Waves",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pointSize: {
    kind: "range",
    label: "Points",
    default: 1.4,
    min: 0.6,
    max: 3,
    step: 0.2,
    unit: "px",
  },
  wind: {
    kind: "range",
    label: "Wind",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Harbour's dawn swim: the sign-up plate floats on the water,
 * riding the same swell the swimmers will.
 */
export function SeaLevelDemo({
  chrome = true,
  // The sea is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [heading, setHeading] = React.useState(0);
  const [blowing, setBlowing] = React.useState(false);
  const waves = values.waveHeight ?? tweaks.waveHeight.default;
  const wind = values.wind ?? tweaks.wind.default;
  const side =
    Math.abs(heading) < 5
      ? "off the sea"
      : heading < 0
        ? "from the west"
        : "from the east";

  const sea = (
    <div
      className="w-full overflow-clip rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 256 : 208 }}
    >
      <SeaLevel
        heading={heading}
        onHeadingChange={setHeading}
        onActiveChange={setBlowing}
        floatAt={[0.5, chrome ? 0.9 : 0.88]}
        {...values}
      >
        <div className="max-w-48 rounded-3 border border-hairline bg-background/85 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Harbour
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
            Dawn swim, Saturday
          </p>
          {chrome ? (
            <button
              type="button"
              className="mt-2 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Save a place
            </button>
          ) : null}
        </div>
      </SeaLevel>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{sea}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sea}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {blowing ? (
          <>
            <span className="text-signal">wind in hand</span> · chop builds from
            your side
          </>
        ) : (
          <>
            <span className="text-signal">
              {waves === 0 ? "glass" : "calm"}
            </span>{" "}
            · swell {waves.toFixed(2)}, breeze {wind.toFixed(2)} {side}
          </>
        )}
      </p>
    </div>
  );
}
