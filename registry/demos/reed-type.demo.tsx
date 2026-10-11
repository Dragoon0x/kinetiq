"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ReedType } from "@/registry/ui/reed-type";

export const tweaks = defineTweaks({
  stalk: {
    kind: "range",
    label: "Stalk",
    default: 0.9,
    min: 0.4,
    max: 1.6,
    step: 0.1,
    unit: "em",
  },
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
  },
  coupling: {
    kind: "range",
    label: "Coupling",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fernworks plants water gardens: its headline stands at the water's edge and
 * sways as the visitor passes.
 */
export function ReedTypeDemo({
  chrome = true,
  // The reeds are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [swaying, setSwaying] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks · water gardens
      </p>
      <ReedType
        as="h2"
        text="Down by the water"
        onSwayChange={setSwaying}
        className="text-[11.5cqw] font-semibold tracking-tight text-foreground @md:text-[min(8.5cqw,3.6rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {swaying ? (
            <>
              <span className="text-signal">swaying</span> · the reeds are
              settling
            </>
          ) : (
            <>
              <span className="text-signal">still</span> · brush through the
              reeds
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
