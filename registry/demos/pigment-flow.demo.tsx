"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PigmentFlow } from "@/registry/ui/pigment-flow";

export const tweaks = defineTweaks({
  colors: {
    kind: "choice",
    label: "Colors",
    default: "ink",
    options: ["ink", "tide", "ember", "moss"],
    names: { ink: "Ink", tide: "Tide", ember: "Ember", moss: "Moss" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 3,
    step: 0.1,
    unit: "×",
  },
  stir: {
    kind: "range",
    label: "Stir",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks Inks' studio set: the headline is the product — water inks that
 * bloom into the letters and swirl under the reader's hand.
 */
export function PigmentFlowDemo({
  chrome = true,
  // The inks are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [stirring, setStirring] = React.useState(false);
  const speed = values.speed ?? tweaks.speed.default;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Inks · studio set 04
      </p>
      <PigmentFlow
        as="h2"
        text="Pigment you can stir"
        focusable
        onStirChange={setStirring}
        className="text-[clamp(1.9rem,9cqi,3.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-foreground"
        {...values}
      />
      <p className="text-sm text-ink-2">Twelve water inks, ground by hand.</p>
      {chrome ? (
        <p
          role="status"
          className="mt-1 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {stirring ? (
            <>
              <span className="text-signal">stirring</span> · the pigments swirl
              and settle
            </>
          ) : !motionSafe || speed === 0 ? (
            <>
              <span className="text-signal">still</span> · 4 pigments · hover to
              drop one in
            </>
          ) : (
            <>
              <span className="text-signal">drifting</span> · 4 pigments · move
              across to stir
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
