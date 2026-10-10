"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GooRadio, type GooRadioOption } from "@/registry/ui/goo-radio";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "signal", "ember", "rose"],
    names: { cobalt: "Cobalt", signal: "Signal", ember: "Ember", rose: "Rose" },
  },
});

const ROASTS: GooRadioOption[] = [
  { value: "light", label: "Light", description: "Citrus, bright" },
  { value: "medium", label: "Medium", description: "Cocoa, round" },
  { value: "dark", label: "Dark", description: "Smoke, bold" },
  { value: "decaf", label: "Decaf", description: "Gentle, nutty" },
];

/**
 * A Coldbrook bag of house blend: the roast is chosen by moving one drop of
 * goo from ring to ring.
 */
export function GooRadioDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [roast, setRoast] = React.useState("medium");
  const picked = ROASTS.find((r) => r.value === roast);

  const card = (
    <div className="@container w-full">
      <div className="flex w-full flex-col gap-2 rounded-4 border border-hairline bg-card p-3 @[22rem]:gap-3 @[22rem]:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
          <p className="text-sm font-medium text-foreground">
            Coldbrook house blend
          </p>
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Roast · 340 g
          </p>
        </div>
        <GooRadio
          label="Roast"
          name="roast"
          options={ROASTS}
          value={roast}
          onValueChange={setRoast}
          sound={sound}
          {...values}
        />
      </div>
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-md justify-center">{card}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {card}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          roast {picked?.label.toLowerCase() ?? "none"}
        </span>
        {picked?.description ? ` · ${picked.description.toLowerCase()}` : ""}
      </p>
    </div>
  );
}
