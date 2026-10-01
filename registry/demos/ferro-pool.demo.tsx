"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { FerroPool } from "@/registry/ui/ferro-pool";

export const tweaks = defineTweaks({
  strength: {
    kind: "range",
    label: "Strength",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spikes: {
    kind: "range",
    label: "Spikes",
    default: 16,
    min: 8,
    max: 32,
    step: 1,
  },
  sheen: {
    kind: "range",
    label: "Sheen",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks' field notes on magnetic fluids: the cover is a pool of the
 * fluid itself, under the reader's magnet.
 */
export function FerroPoolDemo({
  chrome = true,
  // The pool is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pulses, setPulses] = React.useState(0);

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <FerroPool
        onPulse={() => setPulses((n) => n + 1)}
        className={cn("w-full rounded-3", chrome ? "h-72" : "h-52")}
        {...values}
      >
        <div className="flex h-full items-start p-3">
          <div className="max-w-[85%] rounded-2 border border-hairline bg-background/85 px-3 py-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Basinworks field notes
            </p>
            <p className="mt-0.5 text-sm leading-tight font-medium text-foreground">
              Magnetic fluids, issue 12
            </p>
          </div>
        </div>
      </FerroPool>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {pulses > 0 ? (
            <>
              <span className="text-signal">
                pulsed {pulses} time{pulses === 1 ? "" : "s"}
              </span>{" "}
              · click again
            </>
          ) : (
            <>
              <span className="text-signal">pool at rest</span> · hover, then
              click to pulse
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
