"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { CoasterTrack } from "@/registry/ui/coaster-track";

export const tweaks = defineTweaks({
  track: {
    kind: "choice",
    label: "Track",
    default: "classic",
    options: ["classic", "camel", "twin"],
    names: { classic: "Classic", camel: "Camel", twin: "Twin" },
  },
  gravity: {
    kind: "range",
    label: "Gravity",
    default: 1,
    min: 0.4,
    max: 2,
    step: 0.1,
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 1.25,
    min: 0.8,
    max: 2.4,
    step: 0.05,
    unit: "em",
  },
});

/** Waylight's trail app, saying the one thing it says. */
export function CoasterTrackDemo({
  chrome = true,
  // The ride is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [laps, setLaps] = React.useState(0);
  const [towing, setTowing] = React.useState(false);

  const ride = (
    <CoasterTrack
      text="Take the long way round — every trail, every turn"
      as="p"
      onLap={setLaps}
      onTowChange={setTowing}
      className={cn(
        "w-full text-[clamp(13px,2.1cqw,17px)] font-medium tracking-tight",
        "h-52",
      )}
      {...values}
    />
  );

  if (!chrome) return <div className="@container flex w-full">{ride}</div>;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight · the long way round
      </p>
      {ride}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {towing ? (
          <>
            <span className="text-signal">towing</span> · the chain runs fast
          </>
        ) : (
          <>
            <span className="text-signal">
              riding{laps ? ` · lap ${laps + 1}` : ""}
            </span>{" "}
            · hold the lift hill to tow
          </>
        )}
      </p>
    </div>
  );
}
