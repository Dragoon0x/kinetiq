"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlicedHorizon } from "@/registry/ui/sliced-horizon";

export const tweaks = defineTweaks({
  slices: {
    kind: "range",
    label: "Slices",
    default: 14,
    min: 6,
    max: 28,
    step: 1,
  },
  offset: {
    kind: "range",
    label: "Offset",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "dusk",
    options: ["dusk", "lagoon", "ember", "cobalt"],
    names: { dusk: "Dusk", lagoon: "Lagoon", ember: "Ember", cobalt: "Cobalt" },
  },
});

/**
 * Coldbrook Records' summer sleeve as a hero: the sunset drifts in slices,
 * and comes into register wherever the visitor rests the pointer.
 */
export function SlicedHorizonDemo({
  chrome = true,
  // The poster is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [aligned, setAligned] = React.useState(false);

  const poster = (
    <SlicedHorizon
      key={run}
      sunX={0.7}
      onAlignChange={setAligned}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-3 sm:p-4">
        <div className="max-w-60 rounded-2 border border-hairline bg-background/85 px-3 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Coldbrook Records
          </p>
          <p className="mt-1 text-base leading-snug font-semibold text-balance text-foreground sm:text-lg">
            Summer sessions, side A
          </p>
          {chrome ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Pre-order
              </button>
              <span className="text-xs text-ink-2">Vinyl, out July</span>
            </div>
          ) : null}
        </div>
      </div>
    </SlicedHorizon>
  );

  if (!chrome) return <div className="flex w-full">{poster}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {poster}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {aligned ? (
            <>
              <span className="text-signal">in register</span> · the sun is
              whole
            </>
          ) : (
            <>
              <span className="text-signal">drifting</span> · rest the pointer
              to align
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setRun((n) => n + 1);
            setAligned(false);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Print again
        </button>
      </div>
    </div>
  );
}
