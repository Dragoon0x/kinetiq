"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { VinylScrub } from "@/registry/ui/vinyl-scrub";

export const tweaks = defineTweaks({
  rpm: {
    kind: "choice",
    label: "Speed",
    default: "33",
    options: ["33", "45"],
    names: { "33": "33⅓ rpm", "45": "45 rpm" },
  },
  grip: {
    kind: "range",
    label: "Grip",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  inertia: {
    kind: "range",
    label: "Inertia",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tonearm: { kind: "toggle", label: "Tonearm", default: true },
});

/** Three minutes and twenty-four seconds. */
const LENGTH = 204;

const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Fieldline Radio, deck A: "Basin Lights" by the Coldbrook Quartet is
 * playing. Catch the record to stop it and spin it back to the first beat,
 * or hold an arrow key to do the same; let go and it plays on.
 */
export function VinylScrubDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [time, setTime] = React.useState(42);
  const [playing, setPlaying] = React.useState(true);
  const [scrubbing, setScrubbing] = React.useState(false);

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {chrome ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-foreground">
            Basin Lights
          </p>
          <p className="shrink-0 text-xs text-ink-3">Coldbrook Quartet</p>
        </div>
      ) : null}
      <VinylScrub
        label="Deck A, Basin Lights"
        duration={LENGTH}
        value={time}
        onValueChange={setTime}
        playing={playing}
        onPlayingChange={setPlaying}
        onScrubChange={setScrubbing}
        sound={sound}
        className="self-center"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {/* States, not the running clock: a live region that ticked every
              second would talk over everything else. */}
          {scrubbing ? (
            <>
              <span className="text-signal">scrubbing</span> · let go to play on
            </>
          ) : playing ? (
            <>
              <span className="text-signal">playing</span> · catch the record to
              stop it
            </>
          ) : (
            <>
              <span className="text-signal">cued at {clock(time)}</span> · space
              to play
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
