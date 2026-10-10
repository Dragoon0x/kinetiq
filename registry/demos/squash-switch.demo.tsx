"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { SquashSwitch } from "@/registry/ui/squash-switch";

export const tweaks = defineTweaks({
  softness: {
    kind: "range",
    label: "Softness",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "mint",
    options: ["mint", "cobalt", "amber", "rose"],
    names: { mint: "Mint", cobalt: "Cobalt", amber: "Amber", rose: "Rose" },
  },
});

/**
 * Waylight's display settings: two switches in a panel, the first one wired
 * to the status line.
 */
export function SquashSwitchDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [night, setNight] = React.useState(true);
  const [tone, setTone] = React.useState(false);

  const rows = [
    {
      id: "night",
      title: "Night shift",
      hint: "Warmer screen after sunset",
      on: night,
      set: setNight,
    },
    {
      id: "tone",
      title: "True tone",
      hint: "Match the light in the room",
      on: tone,
      set: setTone,
    },
  ];

  const panel = (
    <div className="flex w-full max-w-xs min-w-0 flex-col self-center rounded-3 border border-hairline bg-card">
      {rows.map((row, i) => (
        <div
          key={row.id}
          className={cn(
            "flex items-center justify-between gap-4 px-4 py-2",
            i > 0 && "border-t border-hairline",
          )}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{row.title}</p>
            <p className="text-xs text-ink-3">{row.hint}</p>
          </div>
          <SquashSwitch
            label={row.title}
            hideLabel
            checked={row.on}
            onCheckedChange={row.set}
            sound={sound}
            {...values}
          />
        </div>
      ))}
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{panel}</div>;
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {night ? "night shift on" : "night shift off"}
        </span>
        {night ? " · from 21:00 to 07:00" : " · screen at its own white"}
      </p>
    </div>
  );
}
