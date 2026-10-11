"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RiverScript, type RiverFlow } from "@/registry/ui/river-script";

export const tweaks = defineTweaks({
  meander: {
    kind: "range",
    label: "Meander",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  flowSpeed: {
    kind: "range",
    label: "Flow",
    default: 38,
    min: 10,
    max: 90,
    step: 4,
    unit: "px/s",
  },
  width: {
    kind: "range",
    label: "Width",
    default: 30,
    min: 16,
    max: 48,
    step: 2,
    unit: "px",
  },
});

/**
 * Coldbrook Valley's river walk: the trail guide's map, with the day's
 * notice drifting down the river itself.
 */
export function RiverScriptDemo({
  chrome = true,
  // The river is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [paused, setPaused] = React.useState(false);
  const [flow, setFlow] = React.useState<RiverFlow>("flowing");

  const map = (
    <div className="w-full overflow-clip rounded-3 border border-hairline bg-card text-[13px] text-foreground">
      <RiverScript
        text="Down from the fells the water idles through the pools and races the narrows to the sea."
        places={["Fern Pool", "the Gauge"]}
        paused={paused}
        onPausedChange={setPaused}
        onFlowChange={setFlow}
        label="Coldbrook river walk map"
        height={chrome ? 220 : 200}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full">{map}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook · river walk
          </p>
          <p className="text-sm font-medium text-foreground">
            Fells to the sea, 9 km
          </p>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {paused ? "Let it flow" : "Hold the current"}
        </button>
      </div>
      {map}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {flow === "paused" ? (
          <>
            <span className="text-signal">held</span> · space to let it flow
          </>
        ) : flow === "reading" ? (
          <>
            <span className="text-signal">slowed to read</span> · move off to
            let it go
          </>
        ) : (
          <>
            <span className="text-signal">flowing</span> · quick through the
            Gauge
          </>
        )}
      </p>
    </div>
  );
}
