"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SpinArt } from "@/registry/ui/spin-art";

export const tweaks = defineTweaks({
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  drips: {
    kind: "range",
    label: "Drip size",
    default: 9,
    min: 4,
    max: 16,
    step: 1,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Paints",
    default: "primary",
    options: ["primary", "sunset", "sea", "ink"],
    names: { primary: "Primary", sunset: "Sunset", sea: "Sea", ink: "Ink" },
  },
});

/**
 * The spin-art stall at the Fieldline Fair: one card each. Spin it, drip it,
 * and take your spiral home.
 */
export function SpinArtDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rpm, setRpm] = React.useState(0);
  const [drops, setDrops] = React.useState(0);

  const table = (
    <SpinArt
      label="Fieldline Fair spin-art turntable"
      sound={sound}
      {...values}
      onSpinChange={setRpm}
      onDrip={setDrops}
      onClear={() => setDrops(0)}
      className="h-52"
    />
  );

  if (!chrome) return <div className="w-full">{table}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Fair · spin-art stall
        </p>
        <p className="text-sm font-medium text-foreground">
          One card each, take it home dry
        </p>
      </div>
      {table}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {rpm === 0 ? "still" : `spinning ${Math.abs(rpm)} rpm`}
        </span>{" "}
        · {drops} {drops === 1 ? "drip" : "drips"}
        {rpm === 0 ? " · tap to drip" : ""}
      </p>
    </div>
  );
}
