"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SteelCard } from "@/registry/ui/steel-card";

export const tweaks = defineTweaks({
  metal: {
    kind: "choice",
    label: "Metal",
    default: "steel",
    options: ["steel", "titanium", "gold", "black"],
    names: {
      steel: "Steel",
      titanium: "Titanium",
      gold: "Gold",
      black: "Black",
    },
  },
  brushAngle: {
    kind: "range",
    label: "Brushing",
    default: 0,
    min: 0,
    max: 175,
    step: 5,
    unit: "°",
  },
  edge: {
    kind: "choice",
    label: "Edge",
    default: "bevel",
    options: ["bevel", "flat", "gilt", "ink"],
    names: { bevel: "Bevel", flat: "Flat", gilt: "Gilt", ink: "Ink" },
  },
});

/**
 * Coldbrook Bank's metal card, ready to ship: hold it to the light, then
 * flick it onto the table to hear the weight of it.
 */
export function SteelCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [drops, setDrops] = React.useState(0);
  const metal = values.metal ?? tweaks.metal.default;
  const angle = values.brushAngle ?? tweaks.brushAngle.default;

  if (!chrome) {
    return (
      <div className="w-full">
        <SteelCard className="py-3" sound={sound} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · metal card
        </p>
        <p className="text-sm font-medium text-foreground">Ready to ship</p>
      </div>
      <SteelCard
        className="py-5"
        sound={sound}
        onDrop={() => setDrops((n) => n + 1)}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {drops === 0
            ? "in hand"
            : `dropped ${drops === 1 ? "once" : `${drops} times`}`}
        </span>{" "}
        · {metal}, brushed {angle}°
      </p>
    </div>
  );
}
