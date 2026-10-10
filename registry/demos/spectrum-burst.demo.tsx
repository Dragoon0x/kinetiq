"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SpectrumBurst } from "@/registry/ui/spectrum-burst";

export const tweaks = defineTweaks({
  rays: {
    kind: "range",
    label: "Rays",
    default: 16,
    min: 4,
    max: 36,
    step: 1,
  },
  dispersion: {
    kind: "range",
    label: "Dispersion",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
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
 * Fieldline 4's launch page: the line sits under a burst of split light that
 * the visitor's hand carries about and a press rings out.
 */
export function SpectrumBurstDemo({
  chrome = true,
  // The light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [carried, setCarried] = React.useState(false);
  const [blooms, setBlooms] = React.useState(0);
  const [blooming, setBlooming] = React.useState(false);
  const rays = Math.round(values.rays ?? 16);
  const dispersion = values.dispersion ?? 0.5;

  // The ring has crossed and the rays have settled by the time this fires.
  React.useEffect(() => {
    if (blooms === 0) return;
    const done = window.setTimeout(() => setBlooming(false), 900);
    return () => window.clearTimeout(done);
  }, [blooms]);

  const burst = (
    <SpectrumBurst
      originY={0.36}
      onActiveChange={setCarried}
      onBurst={() => {
        setBlooming(true);
        setBlooms((n) => n + 1);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col items-center justify-end p-5 text-center @lg:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Fieldline 4
          </p>
          <p className="mt-1.5 max-w-64 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            Every colour at once
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the release
              </button>
              <span className="text-xs text-ink-2">Out on the first</span>
            </div>
          ) : null}
        </div>
      </div>
    </SpectrumBurst>
  );

  if (!chrome) return <div className="flex w-full">{burst}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {burst}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {blooming ? (
          <>
            <span className="text-signal">bloom</span> · the burst rings out
          </>
        ) : carried ? (
          <>
            <span className="text-signal">carried</span> · the light follows
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{rays} rays</span> · dispersion{" "}
            {dispersion.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
