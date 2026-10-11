"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SeamLight } from "@/registry/ui/seam-light";

export const tweaks = defineTweaks({
  aperture: {
    kind: "range",
    label: "Aperture",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Hall's late-night listing: the line stands on the stage floor
 * and the light from the seam beneath it throws the words up the wall.
 */
export function SeamLightDemo({
  chrome = true,
  // The light is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const aperture = values.aperture ?? 0.5;
  const haze = values.haze ?? 0.5;
  const warmth = values.warmth ?? 0.6;
  const tone = warmth > 0.66 ? "amber" : warmth > 0.33 ? "warm" : "white";

  const hero = (
    <div
      className={
        chrome
          ? "h-64 w-full overflow-clip rounded-3 border border-hairline"
          : "h-52 w-full overflow-clip rounded-3 border border-hairline"
      }
    >
      <SeamLight
        key={run}
        headline="Open after dark"
        onOpen={() => setOpen(true)}
        {...values}
      >
        <p className="font-mono text-[10px] tracking-[0.12em] text-ink-2 uppercase">
          Fieldline Hall · Thursdays
        </p>
      </SeamLight>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">
                seam {Math.round(aperture * 100)}% open
              </span>{" "}
              · haze {haze.toFixed(2)} · {tone}
            </>
          ) : (
            <>
              <span className="text-signal">seam opening</span> · light from
              below
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setRun((n) => n + 1);
          }}
          className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Open it again
        </button>
      </div>
    </div>
  );
}
