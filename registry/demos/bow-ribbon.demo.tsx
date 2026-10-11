"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BowRibbon } from "@/registry/ui/bow-ribbon";

export const tweaks = defineTweaks({
  ribbonWidth: {
    kind: "range",
    label: "Ribbon",
    default: 1.6,
    min: 1.2,
    max: 2.4,
    step: 0.1,
    unit: "em",
  },
  sheen: {
    kind: "range",
    label: "Sheen",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  bowSize: {
    kind: "range",
    label: "Bow",
    default: 1,
    min: 0.6,
    max: 1.6,
    step: 0.1,
  },
});

/**
 * A Waylight gift card: the message arrives on a ribbon and ties itself in a
 * bow before the card is handed over.
 */
export function BowRibbonDemo({
  chrome = true,
  // The ribbon is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [state, setState] = React.useState<"waiting" | "tying" | "tied">(
    "waiting",
  );

  const ribbon = (
    <div className="@container w-full">
      <BowRibbon
        text="Happy birthday, Juno"
        as="h2"
        replayKey={run}
        onStart={() => setState("tying")}
        onComplete={() => setState("tied")}
        className="text-[clamp(0.6875rem,5.2cqi,1.625rem)] text-foreground"
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight · gift card
        </p>
        {ribbon}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · gift card
          </p>
          <button
            type="button"
            onClick={() => setRun((n) => n + 1)}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Tie it again
          </button>
        </div>
        {ribbon}
        <p className="text-sm text-ink-2">
          60 to spend at the Coldbrook Bookshop, from all of us.
        </p>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {state === "tied" ? (
          <>
            <span className="text-signal">tied</span> · ready to give
          </>
        ) : state === "tying" ? (
          <>
            <span className="text-signal">unspooling</span> · then the bow
          </>
        ) : (
          <>
            <span className="text-signal">wrapped</span> · scroll it into view
          </>
        )}
      </p>
    </div>
  );
}
