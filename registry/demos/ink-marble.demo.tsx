"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { InkMarble } from "@/registry/ui/ink-marble";

export const tweaks = defineTweaks({
  bands: {
    kind: "range",
    label: "Bands",
    default: 6,
    min: 4,
    max: 10,
    step: 1,
  },
  comb: {
    kind: "range",
    label: "Comb",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "ocean",
    options: ["ocean", "ember", "moss"],
    names: { ocean: "Ocean", ember: "Ember", moss: "Moss" },
  },
});

const SET = { ocean: "Ocean", ember: "Ember", moss: "Moss" } as const;

/**
 * Fieldline Press selling hand-marbled endpapers: the banner sits on a sheet
 * still on the bath, and the visitor combs it.
 */
export function InkMarbleDemo({
  chrome = true,
  // The ink is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sheet, setSheet] = React.useState(0);
  const [strokes, setStrokes] = React.useState(0);
  const [combing, setCombing] = React.useState(false);
  const set = SET[values.palette ?? "ocean"];

  const paper = (
    <InkMarble
      key={sheet}
      label="Marbled paper behind the Fieldline Press banner"
      onCombChange={(now) => {
        setCombing(now);
        if (!now) setStrokes((n) => n + 1);
      }}
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
            Fieldline Press
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Endpapers, combed by hand
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">{set} set · 12 sheets</p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Order a set
              </button>
            </>
          ) : null}
        </div>
      </div>
    </InkMarble>
  );

  if (!chrome) return <div className="flex w-full">{paper}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {paper}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {combing ? (
            <>
              <span className="text-signal">combing</span> · the ink follows the
              tines
            </>
          ) : strokes === 0 ? (
            <>
              <span className="text-signal">bands at rest</span> · drag to comb
            </>
          ) : (
            <>
              <span className="text-signal">
                {strokes} {strokes === 1 ? "stroke" : "strokes"}
              </span>{" "}
              · the ink relaxes
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setSheet((n) => n + 1);
            setStrokes(0);
            setCombing(false);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Fresh sheet
        </button>
      </div>
    </div>
  );
}
