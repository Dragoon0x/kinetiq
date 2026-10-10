"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MoltenMark } from "@/registry/ui/molten-mark";

export const tweaks = defineTweaks({
  tint: {
    kind: "choice",
    label: "Metal",
    default: "chrome",
    options: ["chrome", "gold", "copper", "accent"],
    names: {
      chrome: "Chrome",
      gold: "Gold",
      copper: "Copper",
      accent: "Accent",
    },
  },
  flow: {
    kind: "range",
    label: "Flow",
    default: 1,
    min: 0,
    max: 2,
    step: 0.25,
  },
  shine: {
    kind: "range",
    label: "Shine",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks, a foundry that casts to order: its mark poured in the metal
 * of the day, in the lockup at the top of the order page.
 */
export function MoltenMarkDemo({
  chrome = true,
  // The metal is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pours, setPours] = React.useState(0);
  const [phase, setPhase] = React.useState<"waiting" | "pouring" | "cast">(
    "waiting",
  );

  const lockup = (
    <div className="@container w-full">
      <div className="flex flex-col items-center gap-2 text-center @[26rem]:flex-row @[26rem]:gap-6 @[26rem]:text-left">
        <MoltenMark
          label="Basinworks"
          pourKey={pours}
          onPour={() => setPhase("pouring")}
          onPoured={() => setPhase("cast")}
          className="size-32 shrink-0 @[26rem]:size-40"
          {...values}
        />
        <div className="min-w-0">
          <p className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-foreground @[26rem]:text-3xl">
            Basinworks
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Foundry · cast to order
          </p>
        </div>
      </div>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-md">{lockup}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {lockup}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {phase === "waiting" ? (
            <>
              <span className="text-signal">mould ready</span> · the pour starts
              in view
            </>
          ) : phase === "pouring" ? (
            <>
              <span className="text-signal">pouring</span> · the metal cools as
              it climbs
            </>
          ) : (
            <>
              <span className="text-signal">cast</span> · move the light, click
              the metal
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setPours((n) => n + 1)}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Pour again
        </button>
      </div>
    </div>
  );
}
