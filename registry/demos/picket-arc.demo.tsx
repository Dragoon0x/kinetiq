"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PicketArc } from "@/registry/ui/picket-arc";

export const tweaks = defineTweaks({
  sweep: {
    kind: "range",
    label: "Sweep",
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
  pickets: {
    kind: "range",
    label: "Pickets",
    default: 28,
    min: 8,
    max: 64,
    step: 4,
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 305,
    min: 250,
    max: 350,
    step: 5,
    unit: "°",
  },
});

/** Fieldline's night-sky survey, asking for sightings of the arc. */
export function PicketArcDemo({
  chrome = true,
  // The sky is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [reported, setReported] = React.useState(false);

  const hero = (
    <PicketArc
      label="Night sky with a violet arc"
      className={cn("rounded-3", chrome ? "h-64" : "h-56")}
      {...values}
    >
      <div className="@container flex h-full flex-col justify-end gap-2 p-5 text-[oklch(0.97_0.01_260)]">
        <p className="font-mono text-[10px] tracking-[0.12em] text-[oklch(0.86_0.03_260)] uppercase">
          Fieldline · night sky survey
        </p>
        <h2 className="max-w-[22ch] text-xl leading-tight font-semibold tracking-tight text-balance @min-[480px]:text-2xl">
          Seen something in the sky?
        </h2>
        {chrome ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="max-w-[40ch] text-sm text-[oklch(0.86_0.03_260)]">
              A violet arc with a green fence beneath it. Tell us where and
              when.
            </p>
            <button
              type="button"
              onClick={() => setReported(true)}
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-[oklch(0.97_0.01_260)] px-3.5 text-xs font-medium text-[oklch(0.2_0.03_265)] transition-colors outline-none hover:bg-[oklch(0.9_0.02_260)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[oklch(0.97_0.01_260)] focus-visible:outline-solid"
            >
              {reported ? "Sighting noted" : "Report a sighting"}
            </button>
          </div>
        ) : null}
      </div>
    </PicketArc>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reported ? (
          <>
            <span className="text-signal">sighting noted</span> · thank you
          </>
        ) : (
          <>
            <span className="text-signal">arc sweeping</span> · drag the sky to
            move it
          </>
        )}
      </p>
    </div>
  );
}
