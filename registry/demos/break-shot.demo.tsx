"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BreakShot } from "@/registry/ui/break-shot";

export const tweaks = defineTweaks({
  force: {
    kind: "range",
    label: "Force",
    default: 1,
    min: 0.4,
    max: 2,
    step: 0.1,
  },
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  returnDelay: {
    kind: "range",
    label: "Re-rack",
    default: 1600,
    min: 400,
    max: 4000,
    step: 100,
    unit: "ms",
  },
});

/**
 * The Coldbrook Social Club's Thursday league: the night's headline is racked
 * on the club's own table.
 */
export function BreakShotDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [broken, setBroken] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook social club · thursday league
      </p>
      <BreakShot
        as="h2"
        text="Game night"
        sound={sound}
        onBreak={() => setBroken(true)}
        onRack={() => setBroken(false)}
        className="text-[6.4cqw] @md:text-[min(4.6cqw,2.4rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {broken ? (
            <>
              <span className="text-signal">broken</span> · the balls re-rack
              themselves
            </>
          ) : (
            <>
              <span className="text-signal">racked</span> · sweep through or
              press Enter
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
