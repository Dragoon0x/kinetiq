"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ChevronTide } from "@/registry/ui/chevron-tide";

export const tweaks = defineTweaks({
  scale: {
    kind: "range",
    label: "Scale",
    default: 28,
    min: 12,
    max: 48,
    step: 4,
    unit: "px",
  },
  swell: {
    kind: "range",
    label: "Swell",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "harbour",
    options: ["harbour", "sand", "slate"],
    names: { harbour: "Harbour", sand: "Sand", slate: "Slate" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * Basinworks Marina opening its moorings for the season: the hero sits on a
 * herringbone deck cloth that rolls like the water beyond it.
 */
export function ChevronTideDemo({
  chrome = true,
  // The cloth is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [nudged, setNudged] = React.useState(false);
  const scale = values.scale ?? 28;
  const swell = values.swell ?? 0.6;

  const cloth = (
    <ChevronTide
      onActiveChange={setNudged}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Marina
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Moorings open for spring
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Forty berths, sheltered from the swell
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Book a berth
              </button>
            </>
          ) : null}
        </div>
      </div>
    </ChevronTide>
  );

  if (!chrome) return <div className="flex w-full">{cloth}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {cloth}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {nudged ? (
          <>
            <span className="text-signal">nudged</span> · the swell follows you
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {scale} px weave,
            swell {swell.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
