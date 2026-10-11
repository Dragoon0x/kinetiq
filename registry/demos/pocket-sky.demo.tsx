"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PocketSky } from "@/registry/ui/pocket-sky";

export const tweaks = defineTweaks({
  coverage: {
    kind: "range",
    label: "Coverage",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sunHeight: {
    kind: "range",
    label: "Sun height",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  windDrag: {
    kind: "range",
    label: "Wind drag",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Weather = "calm" | "wind" | "gathering";

/**
 * Coldbrook Weather: Saturday's forecast set in the sky it describes, for the
 * visitor to push about.
 */
export function PocketSkyDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [weather, setWeather] = React.useState<Weather>("calm");
  const timer = React.useRef<number | null>(null);
  const cover = Math.round((values.coverage ?? 0.45) * 100);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onWindChange = (blowing: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (!blowing) {
      setWeather("calm");
      return;
    }
    setWeather("wind");
    // Once the hand has passed, the clouds are gathering until they report in.
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setWeather((w) => (w === "wind" ? "gathering" : w));
    }, 1200);
  };

  const sky = (
    <PocketSky
      onWindChange={onWindChange}
      className={
        chrome
          ? "h-60 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4">
        <div className="rounded-3 bg-background/80 px-3.5 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook · Saturday
          </p>
          <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
            Fair, with a light westerly
          </p>
        </div>
      </div>
    </PocketSky>
  );

  if (!chrome) return <div className="flex w-full">{sky}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sky}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {weather === "calm"
            ? "calm"
            : weather === "wind"
              ? "your wind"
              : "gathering"}
        </span>
        {weather === "calm"
          ? ` · ${cover}% cover`
          : weather === "wind"
            ? " · clouds parting"
            : " · the clouds re-form"}
      </p>
    </div>
  );
}
