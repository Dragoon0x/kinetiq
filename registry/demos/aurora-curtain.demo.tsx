"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { AuroraCurtain } from "@/registry/ui/aurora-curtain";

export const tweaks = defineTweaks({
  curtains: {
    kind: "range",
    label: "Curtains",
    default: 3,
    min: 1,
    max: 5,
    step: 1,
  },
  rays: {
    kind: "range",
    label: "Rays",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "polar",
    options: ["polar", "glacier", "rose", "ember"],
    names: { polar: "Polar", glacier: "Glacier", rose: "Rose", ember: "Ember" },
  },
});

/**
 * Fieldline Expeditions sells small trips north: the hero is the sky they
 * promise, with the curtains standing behind the offer.
 */
export function AuroraCurtainDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [gathering, setGathering] = React.useState(false);
  const [flaring, setFlaring] = React.useState(false);
  const flareTimer = React.useRef<number | null>(null);
  const palette = values.palette ?? "polar";
  const curtains = values.curtains ?? 3;
  const rays = values.rays ?? 0.6;

  const onFlare = React.useCallback(() => {
    setFlaring(true);
    if (flareTimer.current !== null) window.clearTimeout(flareTimer.current);
    flareTimer.current = window.setTimeout(() => {
      flareTimer.current = null;
      setFlaring(false);
    }, 1200);
  }, []);

  React.useEffect(
    () => () => {
      if (flareTimer.current !== null) window.clearTimeout(flareTimer.current);
    },
    [],
  );

  const sky = (
    <AuroraCurtain
      onActiveChange={setGathering}
      onFlare={onFlare}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 pb-6 sm:p-6 sm:pb-8">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Expeditions
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Seven nights under the curtains
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Small groups, dark skies, a guide who reads the forecast
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See departures
              </button>
            </>
          ) : null}
        </div>
      </div>
    </AuroraCurtain>
  );

  if (!chrome) return <div className="flex w-full">{sky}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sky}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {flaring ? (
          <>
            <span className="text-signal">flaring</span> · rays rising on the
            nearest curtain
          </>
        ) : gathering ? (
          <>
            <span className="text-signal">gathering</span> · rays under your
            hand
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · {curtains}{" "}
            {curtains === 1 ? "curtain" : "curtains"} · rays {rays.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
