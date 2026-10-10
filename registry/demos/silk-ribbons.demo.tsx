"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SilkRibbons } from "@/registry/ui/silk-ribbons";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 5,
    min: 1,
    max: 8,
    step: 1,
  },
  length: {
    kind: "range",
    label: "Length",
    default: 220,
    min: 80,
    max: 400,
    step: 20,
    unit: "px",
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "opal",
    options: ["opal", "ember", "tide", "mono"],
    names: { opal: "Opal", ember: "Ember", tide: "Tide", mono: "Mono" },
  },
});

type Phase = "flight" | "near" | "whipped";

/**
 * Fernworks' spring silks: a launch hero where the season's ribbons stream
 * from the cursor and wind themselves round the call to action on focus.
 */
export function SilkRibbonsDemo({
  chrome = true,
  // The ribbons are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("flight");
  const [whips, setWhips] = React.useState(0);

  const hero = (
    <SilkRibbons
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        chrome ? "h-64" : "h-52",
      )}
      onWhip={() => {
        setWhips((n) => n + 1);
        setPhase("whipped");
      }}
      {...values}
    >
      <div
        className="flex size-full flex-col items-start justify-end gap-2 p-4 sm:p-5"
        onPointerEnter={() => setPhase((p) => (p === "flight" ? "near" : p))}
        onPointerLeave={() => setPhase((p) => (p === "near" ? "flight" : p))}
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks · spring silks
        </p>
        <p className="max-w-[16rem] text-lg leading-snug font-semibold tracking-tight text-balance text-foreground">
          Cut from the softest light.
        </p>
        {chrome ? (
          <button
            type="button"
            className="inline-flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            View the collection
          </button>
        ) : null}
      </div>
    </SilkRibbons>
  );

  if (!chrome) return <div className="flex w-full">{hero}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "whipped" ? (
          <>
            <span className="text-signal">
              whipped {whips} {whips === 1 ? "time" : "times"}
            </span>{" "}
            · press again to throw a loop
          </>
        ) : phase === "near" ? (
          <>
            <span className="text-signal">following you</span> · press to whip
          </>
        ) : (
          <>
            <span className="text-signal">in flight</span> · move across or
            press Tab
          </>
        )}
      </p>
    </div>
  );
}
