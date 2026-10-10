"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FiberMist } from "@/registry/ui/fiber-mist";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Fibres",
    default: 260,
    min: 60,
    max: 480,
    step: 20,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  curl: {
    kind: "range",
    label: "Curl",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Fibre launching a range of fibre-optic lamps: the hero sits in a
 * haze of the lamps' own light, spun fine.
 */
export function FiberMistDemo({
  chrome = true,
  // The mist is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [combing, setCombing] = React.useState(false);
  const count = values.count ?? 260;

  const mist = (
    <FiberMist
      onActiveChange={setCombing}
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
            Coldbrook Fibre
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Light, spun fine
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Fibre lamps for reading rooms and halls
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                See the range
              </button>
            </>
          ) : null}
        </div>
      </div>
    </FiberMist>
  );

  if (!chrome) return <div className="flex w-full">{mist}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {mist}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {combing ? (
          <>
            <span className="text-signal">combing</span> · the fibres follow you
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · {count} fibres
            drifting
          </>
        )}
      </p>
    </div>
  );
}
