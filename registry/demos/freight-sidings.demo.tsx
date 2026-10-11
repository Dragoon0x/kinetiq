"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFreightItems,
  FreightSidings,
} from "@/registry/ui/freight-sidings";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 24,
    min: 0,
    max: 40,
    step: 2,
    unit: "°",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  gap: {
    kind: "range",
    label: "Car gap",
    default: 12,
    min: 4,
    max: 32,
    step: 2,
    unit: "px",
  },
});

/**
 * Fernworks Print Fair: twelve prints riding freight cars through the yard
 * on their way to the stalls. Roll the one you like to the front.
 */
export function FreightSidingsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lead, setLead] = React.useState<number | undefined>(undefined);
  const trains = 3;
  const print = lead === undefined ? undefined : defaultFreightItems[lead];

  if (!chrome) {
    return (
      <div className="flex w-full">
        <FreightSidings
          label="Prints on the move"
          value={lead}
          onValueChange={setLead}
          height={588}
          sound={sound}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks Print Fair
        </p>
        <p className="text-base font-medium text-foreground">
          Prints on the move
        </p>
      </div>
      <FreightSidings
        label="Prints on the move"
        value={lead}
        onValueChange={setLead}
        height={440}
        sound={sound}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {print && lead !== undefined ? (
          <>
            <span className="text-signal">lead car</span> · {print.caption} ·
            line {(lead % trains) + 1}
          </>
        ) : (
          <>
            <span className="text-signal">12 prints</span> · click a car to roll
            it to the front
          </>
        )}
      </p>
    </div>
  );
}
