"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StageBeams } from "@/registry/ui/stage-beams";

export const tweaks = defineTweaks({
  beams: {
    kind: "range",
    label: "Beams",
    default: 6,
    min: 2,
    max: 12,
    step: 2,
  },
  haze: {
    kind: "range",
    label: "Haze",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "house",
    options: ["house", "ice", "ember", "mono"],
    names: { house: "House", ice: "Ice", ember: "Ember", mono: "Mono" },
  },
});

/**
 * Basinworks Live's second night: the line hangs above a rig running its
 * show, a beam following the visitor's hand and every beam landing on them
 * when they press.
 */
export function StageBeamsDemo({
  chrome = true,
  // The rig is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [following, setFollowing] = React.useState(false);
  const [hitting, setHitting] = React.useState(false);
  const beams = Math.ceil((values.beams ?? 6) / 2) * 2;
  const haze = values.haze ?? 0.55;

  const rig = (
    <StageBeams
      onActiveChange={setFollowing}
      onHit={setHitting}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container size-full">
        <div className="flex size-full flex-col items-center p-5 text-center @lg:p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            Basinworks Live · night two
          </p>
          <p className="mt-1.5 max-w-64 text-lg leading-snug font-semibold text-balance text-foreground @lg:text-xl">
            The hall goes dark at nine
          </p>
          {chrome ? (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Get tickets
              </button>
              <span className="text-xs text-ink-2">Doors 8:30</span>
            </div>
          ) : null}
        </div>
      </div>
    </StageBeams>
  );

  if (!chrome) return <div className="flex w-full">{rig}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {rig}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hitting ? (
          <>
            <span className="text-signal">hit</span> · every beam on you
          </>
        ) : following ? (
          <>
            <span className="text-signal">follow spot</span> · a beam on your
            hand
          </>
        ) : (
          <>
            <span className="text-signal">{beams} beams</span> · haze{" "}
            {haze.toFixed(2)}
          </>
        )}
      </p>
    </div>
  );
}
