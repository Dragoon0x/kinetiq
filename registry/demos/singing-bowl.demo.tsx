"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SingingBowl } from "@/registry/ui/singing-bowl";

export const tweaks = defineTweaks({
  modes: {
    kind: "range",
    label: "Modes",
    default: 5,
    min: 2,
    max: 8,
    step: 1,
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  metal: {
    kind: "choice",
    label: "Metal",
    default: "brass",
    options: ["brass", "bronze", "copper", "pewter"],
    names: {
      brass: "Brass",
      bronze: "Bronze",
      copper: "Copper",
      pewter: "Pewter",
    },
  },
});

/**
 * Coldbrook Sit, a meditation timer whose bell is a bowl of water: the
 * session starts when it sings.
 */
export function SingingBowlDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [singing, setSinging] = React.useState(false);
  const [petals, setPetals] = React.useState(0);
  const [sung, setSung] = React.useState(false);

  const bowl = (size: string) => (
    <SingingBowl
      className={size}
      label="Session bell"
      sound={sound}
      onSingingChange={(on) => {
        setSinging(on);
        if (on) setSung(true);
      }}
      onModeChange={setPetals}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="flex w-full items-center justify-center">
        {bowl("size-52 shrink-0")}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-3 border border-hairline bg-card px-4 py-4">
        {bowl("size-48 shrink-0")}
        <div className="flex max-w-[12rem] min-w-0 flex-col gap-1.5">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Sit
          </p>
          <p className="text-base leading-snug font-semibold text-foreground">
            Morning sit · 10 min
          </p>
          <p className="text-sm leading-snug text-ink-2">
            Circle the rim to ring the bell. The session begins as the water
            settles.
          </p>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {singing ? (
          <>
            <span className="text-signal">singing</span> · {petals} petals at
            the rim
          </>
        ) : sung ? (
          <>
            <span className="text-signal">settling</span> · the rings let go,
            the session begins
          </>
        ) : (
          <>
            <span className="text-signal">still water</span> · circle the rim,
            or hold Space
          </>
        )}
      </p>
    </div>
  );
}
