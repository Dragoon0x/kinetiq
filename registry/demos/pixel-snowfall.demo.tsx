"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PixelSnowfall } from "@/registry/ui/pixel-snowfall";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wind: {
    kind: "range",
    label: "Wind",
    default: 0.25,
    min: -1,
    max: 1,
    step: 0.05,
  },
  pixel: {
    kind: "range",
    label: "Pixel",
    default: 3,
    min: 2,
    max: 6,
    step: 1,
    unit: "px",
  },
});

/**
 * Coldbrook Lodge's winter page: the line sits in the falling snow, the
 * visitor's hand blows it about, and a press gusts the drift along the
 * bottom into the air.
 */
export function PixelSnowfallDemo({
  chrome = true,
  // The snow is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [blowing, setBlowing] = React.useState(false);
  const [gusts, setGusts] = React.useState(0);
  const [gusting, setGusting] = React.useState(false);
  const wind = values.wind ?? 0.25;
  const pixel = values.pixel ?? 3;

  // The gust has died and its spray landed by the time this fires.
  React.useEffect(() => {
    if (gusts === 0) return;
    const done = window.setTimeout(() => setGusting(false), 1200);
    return () => window.clearTimeout(done);
  }, [gusts]);

  const snow = (
    <PixelSnowfall
      onActiveChange={setBlowing}
      onGust={() => {
        setGusting(true);
        setGusts((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col items-start p-5 text-left @lg:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Coldbrook Lodge
          </p>
          <p className="mt-1.5 max-w-56 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            First snow, first lift
          </p>
          {chrome ? (
            <>
              <p className="mt-1 max-w-60 text-xs text-ink-2">
                Cabins from the second week of December
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Book a cabin
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PixelSnowfall>
  );

  if (!chrome) return <div className="flex w-full">{snow}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {snow}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {gusting ? (
          <>
            <span className="text-signal">gust</span> · the snow thrown up
          </>
        ) : blowing ? (
          <>
            <span className="text-signal">wind</span> · your hand blows the snow
          </>
        ) : (
          <>
            <span className="text-signal">wind {wind.toFixed(2)}</span> ·{" "}
            {pixel} px snow
          </>
        )}
      </p>
    </div>
  );
}
