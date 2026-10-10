"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TubeGlow } from "@/registry/ui/tube-glow";

export const tweaks = defineTweaks({
  curve: {
    kind: "range",
    label: "Curve",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  scanlines: {
    kind: "range",
    label: "Scanlines",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "aurora",
    options: ["aurora", "ember", "lagoon", "mono"],
    names: { aurora: "Aurora", ember: "Ember", lagoon: "Lagoon", mono: "Mono" },
  },
  bloom: {
    kind: "range",
    label: "Bloom",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Television's evening schedule: the hero sits in front of the
 * set, its picture a slow field of colour.
 */
export function TubeGlowDemo({
  chrome = true,
  // The tube is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leaning, setLeaning] = React.useState(false);
  const colors = values.colors ?? "aurora";
  const curve = values.curve ?? 0.5;

  const tube = (
    <TubeGlow
      onActiveChange={setLeaning}
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
            Fieldline Television
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Tonight, in colour
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Three films and the late news from nine
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the schedule
              </button>
            </>
          ) : null}
        </div>
      </div>
    </TubeGlow>
  );

  if (!chrome) return <div className="flex w-full">{tube}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {tube}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {leaning ? (
          <>
            <span className="text-signal">leaning</span> · the tube follows you
          </>
        ) : (
          <>
            <span className="text-signal">on air</span> · {colors} field, curve{" "}
            {curve.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
