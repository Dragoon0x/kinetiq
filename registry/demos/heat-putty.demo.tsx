"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { HeatPutty } from "@/registry/ui/heat-putty";

export const tweaks = defineTweaks({
  warmth: {
    kind: "range",
    label: "Warmth",
    default: 1,
    min: 0.2,
    max: 2,
    step: 0.1,
  },
  cooling: {
    kind: "range",
    label: "Cooling",
    default: 1,
    min: 0.2,
    max: 2,
    step: 0.1,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "sunset",
    options: ["mood", "sunset", "glacier", "orchid"],
    names: {
      mood: "Mood",
      sunset: "Sunset",
      glacier: "Glacier",
      orchid: "Orchid",
    },
  },
});

/** Basinworks Thermo Putty, out of its tin on the studio bench. */
export function HeatPuttyDemo({
  chrome = true,
  // The putty is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [heat, setHeat] = React.useState({ now: 0, rising: false });

  const putty = (
    <HeatPutty
      label="Basinworks thermo putty"
      onHeatChange={(h) =>
        setHeat((s) => ({
          now: h,
          rising: h > s.now || (h === s.now && s.rising),
        }))
      }
      className={cn("w-full", chrome ? "h-56" : "h-52")}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{putty}</div>;

  const percent = Math.round(heat.now * 100);
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks thermo putty · rest a finger on it
      </p>
      {putty}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {percent === 0 ? (
          <>
            <span className="text-signal">cool</span> · warm it with your hand
          </>
        ) : (
          <>
            <span className="text-signal">warmth {percent} %</span> ·{" "}
            {heat.rising ? "warming" : "cooling"}
          </>
        )}
      </p>
    </div>
  );
}
