"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EchoSounder } from "@/registry/ui/echo-sounder";

export const tweaks = defineTweaks({
  pingRate: {
    kind: "range",
    label: "Ping rate",
    default: 2,
    min: 0.5,
    max: 4,
    step: 0.5,
    unit: "/s",
  },
  gain: {
    kind: "range",
    label: "Gain",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  depthScale: {
    kind: "range",
    label: "Depth",
    default: 60,
    min: 20,
    max: 100,
    step: 5,
    unit: "m",
  },
});

type Reading = { depth: number; manual: boolean } | null;

/**
 * Coldbrook Harbour's survey launch on basin line 4: the echogram of the
 * seabed scrolls past under it, and a click sounds the spot at once.
 */
export function EchoSounderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [reading, setReading] = React.useState<Reading>(null);
  const [asked, setAsked] = React.useState<Reading>(null);

  const panel = (
    <div className="relative w-full overflow-clip rounded-3 border border-hairline bg-card">
      <EchoSounder
        label="Coldbrook basin echo sounder"
        sound={sound}
        onPing={(depth, manual) => {
          if (manual) setAsked({ depth, manual });
          else if (chrome) setReading({ depth, manual });
        }}
        className={chrome ? "h-56 w-full" : "h-52 w-full"}
        {...values}
      />
      <p className="pointer-events-none absolute top-1 right-2 font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
        Basin line 4
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{panel}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Harbour survey
          </p>
          <p className="text-base font-medium text-foreground">
            The basin, sounded as we go
          </p>
        </div>
        <p className="shrink-0 font-mono text-[10px] text-ink-3">
          click to ping · arrows steer
        </p>
      </div>
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {asked ? (
          <>
            <span className="text-signal">ping</span> · {asked.depth.toFixed(1)}{" "}
            m under the keel
          </>
        ) : reading ? (
          <>
            <span className="text-signal">sounding</span> ·{" "}
            {reading.depth.toFixed(1)} m under the keel
          </>
        ) : (
          <>
            <span className="text-signal">under way</span> · the record runs
            behind the launch
          </>
        )}
      </p>
    </div>
  );
}
