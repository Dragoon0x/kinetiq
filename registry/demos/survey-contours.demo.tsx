"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SurveyContours } from "@/registry/ui/survey-contours";

export const tweaks = defineTweaks({
  interval: {
    kind: "range",
    label: "Interval",
    default: 20,
    min: 10,
    max: 50,
    step: 5,
    unit: "m",
  },
  weight: {
    kind: "range",
    label: "Weight",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
  },
  labels: { kind: "toggle", label: "Labels", default: true },
});

/**
 * Fieldline Survey's hero: a map's title block over a living contour sheet;
 * the visitor's hand raises a hill and the sheet prints its summit.
 */
export function SurveyContoursDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [summit, setSummit] = React.useState<number | null>(null);
  const [fell, setFell] = React.useState(false);

  // The line says the hill has gone for a moment, then goes back to the sheet.
  React.useEffect(() => {
    if (!fell) return;
    const quiet = window.setTimeout(() => setFell(false), 1400);
    return () => window.clearTimeout(quiet);
  }, [fell]);

  const sheet = (
    <SurveyContours
      key={run}
      onSummitChange={(elevation) => {
        setFell(elevation === null);
        setSummit(elevation);
      }}
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
            Fieldline Survey
          </p>
          <p className="mt-1 text-base leading-snug font-semibold text-balance text-foreground sm:text-lg">
            Every ridge, measured
          </p>
          {chrome ? (
            <>
              <p className="mt-1 font-mono text-[10px] text-ink-3 tabular-nums">
                Sheet 14 · 1:25 000
              </p>
              <button
                type="button"
                className="mt-2.5 inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Order the sheet
              </button>
            </>
          ) : null}
        </div>
      </div>
    </SurveyContours>
  );

  if (!chrome) return <div className="flex w-full">{sheet}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sheet}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {summit !== null ? (
            <>
              <span className="text-signal tabular-nums">
                summit {summit} m
              </span>{" "}
              · the hill is yours
            </>
          ) : fell ? (
            <>
              <span className="text-signal">the hill subsides</span> · the land
              settles back
            </>
          ) : (
            <>
              <span className="text-signal">sheet drawn</span> · move to raise a
              hill
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setRun((n) => n + 1);
            setSummit(null);
            setFell(false);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Survey again
        </button>
      </div>
    </div>
  );
}
