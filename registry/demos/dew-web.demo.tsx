"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DewWeb } from "@/registry/ui/dew-web";

export const tweaks = defineTweaks({
  density: {
    kind: "range",
    label: "Density",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  sag: {
    kind: "range",
    label: "Sag",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glint: {
    kind: "range",
    label: "Glint",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks Garden's hero: the headline sits beside a web strung with dew;
 * the visitor's hand brushes the silk and a press plucks it.
 */
export function DewWebDemo({
  chrome = true,
  // The web is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [plucks, setPlucks] = React.useState(0);
  const [fresh, setFresh] = React.useState(false);
  const [near, setNear] = React.useState(false);

  // A pluck is news for a moment; then the line goes back to the web.
  React.useEffect(() => {
    if (!fresh) return;
    const quiet = window.setTimeout(() => setFresh(false), 1400);
    return () => window.clearTimeout(quiet);
  }, [fresh, plucks]);

  const web = (
    <DewWeb
      key={run}
      hub={[0.7, 0.42]}
      onPluck={() => {
        setPlucks((n) => n + 1);
        setFresh(true);
      }}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      contentClassName="flex flex-col justify-end"
      {...values}
    >
      <div className="bg-linear-to-t from-background/80 via-background/40 to-transparent p-4 pt-10 sm:p-5 sm:pt-12">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Fernworks Garden
        </p>
        <p className="mt-1 max-w-64 text-lg leading-snug font-semibold text-balance text-foreground sm:text-xl">
          Open at first light
        </p>
        {chrome ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Reserve a walk
            </button>
            <span className="text-xs text-ink-2">
              Dawn walks, Saturdays at six
            </span>
          </div>
        ) : null}
      </div>
    </DewWeb>
  );

  if (!chrome) return <div className="flex w-full">{web}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setNear(true);
        }}
        onPointerLeave={() => setNear(false)}
      >
        {web}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {fresh ? (
            <>
              <span className="text-signal">plucked</span> ·{" "}
              {plucks === 1 ? "once" : `${plucks} times`}, the silk rings
            </>
          ) : near ? (
            <>
              <span className="text-signal">brushing</span> · the dew catches
              the light
            </>
          ) : (
            <>
              <span className="text-signal">web spun</span> · brush the silk,
              press to pluck
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setRun((n) => n + 1);
            setPlucks(0);
            setFresh(false);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Spin again
        </button>
      </div>
    </div>
  );
}
