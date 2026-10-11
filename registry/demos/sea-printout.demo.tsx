"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SeaPrintout } from "@/registry/ui/sea-printout";

export const tweaks = defineTweaks({
  swell: {
    kind: "range",
    label: "Swell",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  feed: {
    kind: "range",
    label: "Feed",
    default: 4,
    min: 1,
    max: 12,
    step: 1,
    unit: "/s",
  },
  ink: {
    kind: "range",
    label: "Ink",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const chip =
  "inline-flex h-8 shrink-0 items-center rounded-full border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:border-cobalt-bright/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The Basinworks harbour office keeps a line printer running on the sea
 * state: the swell comes in on paper, and the wind is yours to set.
 */
export function SeaPrintoutDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [wind, setWind] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const feed = values.feed ?? tweaks.feed.default;

  const printer = (
    <SeaPrintout
      label="Basinworks sea state: wind"
      wind={wind}
      onWindChange={setWind}
      paused={chrome && paused}
      sound={sound}
      className={cn("w-full", chrome ? "h-96" : "h-[33rem]")}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{printer}</div>;

  const strength = Math.round(Math.abs(wind) * 100);
  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks · harbour office
          </p>
          <p className="text-base font-medium text-foreground">
            Sea state, printed as it rolls in
          </p>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          className={chip}
        >
          {paused ? "Resume feed" : "Pause feed"}
        </button>
      </div>
      {printer}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {paused ? (
          <>
            <span className="text-signal">paused</span> · the page holds
          </>
        ) : strength === 0 ? (
          <>
            <span className="text-signal">printing</span> · calm · {feed}{" "}
            {feed === 1 ? "line" : "lines"} a second
          </>
        ) : (
          <>
            <span className="text-signal">
              wind {strength} from the {wind < 0 ? "west" : "east"}
            </span>{" "}
            ·{" "}
            {strength > 75
              ? "choppy"
              : strength > 33
                ? "a light chop"
                : "smooth"}
          </>
        )}
      </p>
    </div>
  );
}
