"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GelSwitch } from "@/registry/ui/gel-switch";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  stretch: {
    kind: "range",
    label: "Stretch",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wobble: {
    kind: "range",
    label: "Wobble",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  fill: { kind: "toggle", label: "Fill", default: true },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
});

/**
 * Round-ups on a Coldbrook Bank account: the spare change from every card
 * payment goes to savings while the switch is on.
 */
export function GelSwitchDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [on, setOn] = React.useState(true);

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-3 border border-hairline bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Round-ups</p>
          <p className="text-xs text-ink-3">
            Spare change from card payments goes to Savings.
          </p>
        </div>
        <GelSwitch
          label="Round-ups"
          hideLabel
          checked={on}
          onCheckedChange={setOn}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span className="text-signal">
            {on ? "round-ups on" : "round-ups off"}
          </span>
          {on ? " · every card payment" : " · payments untouched"}
        </p>
      ) : null}
    </div>
  );
}
