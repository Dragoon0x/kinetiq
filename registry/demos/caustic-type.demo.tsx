"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CausticType } from "@/registry/ui/caustic-type";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  caustics: {
    kind: "range",
    label: "Caustics",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tint: {
    kind: "choice",
    label: "Water",
    default: "lagoon",
    options: ["lagoon", "glacier", "peat", "night"],
    names: {
      lagoon: "Lagoon",
      glacier: "Glacier",
      peat: "Peat",
      night: "Night",
    },
  },
});

const NOTICE =
  "Coldbrook Lido opens for the summer on the first of May. Lanes from six in the morning, the shallow end from nine, and the water kept at twenty-six degrees until September.";

/**
 * Coldbrook Lido's reopening notice, laid in the floor of the pool: the light
 * through the water moves across it, and the pointer stirs the surface.
 */
export function CausticTypeDemo({
  chrome = true,
  // The pool is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stirred, setStirred] = React.useState(false);

  const card = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Lido · reopening
      </p>
      <CausticType
        text={NOTICE}
        label="Coldbrook Lido notice"
        onStirChange={setStirred}
        {...values}
        className="text-[clamp(0.875rem,2.5cqi,1.125rem)] leading-[1.5] font-medium"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{card}</div>;
  }

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {stirred ? (
          <>
            <span className="text-signal">stirred</span> · ripples spreading
            across the floor
          </>
        ) : (
          <>
            <span className="text-signal">calm</span> · move across the water to
            stir it
          </>
        )}
      </p>
    </div>
  );
}
