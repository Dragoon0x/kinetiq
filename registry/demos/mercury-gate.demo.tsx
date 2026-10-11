"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  MercuryGate,
  defaultMercuryGateDestinations,
} from "@/registry/ui/mercury-gate";

export const tweaks = defineTweaks({
  ripple: {
    kind: "range",
    label: "Ripple",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pull: {
    kind: "range",
    label: "Pull",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const titleOf = (id: string) =>
  defaultMercuryGateDestinations.find((d) => d.id === id)?.title ?? id;

/**
 * Waylight Travel, "Pick a door": four invented places joined by one gate.
 * Hover to look through, click to go, and the gate leads back behind you.
 */
export function MercuryGateDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [here, setHere] = React.useState("field");
  const [there, setThere] = React.useState("coldbrook-shore");
  const [diving, setDiving] = React.useState<string | null>(null);

  const gate = (
    <MercuryGate
      value={here}
      onValueChange={(id) => {
        setHere(id);
        setDiving(null);
      }}
      target={there}
      onTargetChange={setThere}
      onDive={(_, to) => setDiving(to)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {gate}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Travel
        </p>
        <p className="text-sm font-medium text-foreground">Pick a door</p>
      </div>
      <div className="w-full" style={{ height: 232 }}>
        {gate}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {diving ? (
          <>
            <span className="text-signal">diving</span> · {titleOf(diving)}
          </>
        ) : (
          <>
            <span className="text-signal">at {titleOf(here)}</span> · gate leads
            to {titleOf(there)}
          </>
        )}
      </p>
    </div>
  );
}
