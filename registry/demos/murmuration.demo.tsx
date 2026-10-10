"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Murmuration } from "@/registry/ui/murmuration";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 900,
    min: 300,
    max: 1800,
    step: 100,
  },
  attraction: {
    kind: "range",
    label: "Attraction",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
});

/**
 * Fieldline's roost watch: the evening count over the reed bed, where the
 * starlings gather before they drop in to roost.
 */
export function MurmurationDemo({
  chrome = true,
  // The flock is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leading, setLeading] = React.useState(false);
  const [hawk, setHawk] = React.useState(0);
  const birds = values.count ?? tweaks.count.default;

  // The status holds "hawk passing" while the flock breaks and rejoins.
  React.useEffect(() => {
    if (!hawk) return;
    const id = window.setTimeout(() => setHawk(0), 1400);
    return () => window.clearTimeout(id);
  }, [hawk]);

  const sky = (
    <Murmuration
      label="Starlings over the reed bed"
      onLeadChange={setLeading}
      onHawk={() => setHawk((n) => n + 1)}
      className={
        chrome
          ? "aspect-auto h-60 rounded-3 border border-hairline sm:h-72"
          : "aspect-auto h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="@container pointer-events-none flex h-full flex-col p-4">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · roost watch, 17:42
        </p>
        <p className="mt-1 max-w-[60%] text-[clamp(15px,4.6cqi,22px)] leading-tight font-semibold tracking-tight text-balance text-foreground">
          Starlings over the reed bed
        </p>
      </div>
    </Murmuration>
  );

  if (!chrome) return <div className="w-full max-w-2xl">{sky}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sky}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {hawk ? (
          <>
            <span className="text-signal">hawk passing</span> · the flock breaks
            and rejoins
          </>
        ) : leading ? (
          <>
            <span className="text-signal">wheeling</span> round the cursor ·
            click to send a hawk
          </>
        ) : (
          <>
            <span className="text-signal">drifting</span> over the reeds ·{" "}
            {birds.toLocaleString("en-US")} birds
          </>
        )}
      </p>
    </div>
  );
}
