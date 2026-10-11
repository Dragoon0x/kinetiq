"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RingShepherd } from "@/registry/ui/ring-shepherd";

export const tweaks = defineTweaks({
  ringDensity: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
  gapWidth: {
    kind: "range",
    label: "Gaps",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wake: {
    kind: "range",
    label: "Wake",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const BANDS = 6;

/**
 * Basinworks Observatory's ring survey: a close pass over the rings of a
 * cold giant, with a shepherd moon the visitor can fly through them.
 */
export function RingShepherdDemo({
  chrome = true,
  // The rings are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [band, setBand] = React.useState<number | null>(null);
  const [steering, setSteering] = React.useState(false);

  const panel = (
    <div
      className="relative w-full overflow-clip rounded-3 border border-hairline bg-card"
      style={{ height: chrome ? 240 : 208 }}
    >
      <RingShepherd
        bands={BANDS}
        onBandChange={setBand}
        onSteerChange={setSteering}
        {...values}
      />
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-0.5 rounded-2 border border-hairline bg-card/85 px-2.5 py-1.5 backdrop-blur-sm">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks · ring survey
        </p>
        <p className="text-sm leading-snug font-medium text-foreground">
          The Coldbrook rings
        </p>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{panel}</div>;

  const where = band === null ? "in a gap" : `in band ${band + 1} of ${BANDS}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {steering ? (
          <>
            <span className="text-signal">steering</span> · moon {where}
          </>
        ) : (
          <>
            <span className="text-signal">on its own orbit</span> · moon {where}
          </>
        )}
      </p>
    </div>
  );
}
