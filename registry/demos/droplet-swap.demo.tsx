"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  DropletSwap,
  defaultDropletSwapItems,
} from "@/registry/ui/droplet-swap";

export const tweaks = defineTweaks({
  dropSize: {
    kind: "range",
    label: "Drop size",
    default: 0.45,
    min: 0.2,
    max: 0.6,
    step: 0.05,
  },
  rollSpeed: {
    kind: "range",
    label: "Roll speed",
    default: 420,
    min: 160,
    max: 900,
    step: 20,
    unit: "px/s",
  },
  refraction: {
    kind: "range",
    label: "Refraction",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Travel's winter page: five coasts, and every change of picture
 * arrives inside a drop of water.
 */
export function DropletSwapDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const items = defaultDropletSwapItems;
  const n = items.length;

  const gallery = (
    <DropletSwap
      items={items}
      value={index}
      onValueChange={setIndex}
      label="Coldbrook Travel, five coasts this winter"
      sound={sound}
      className="h-full w-full"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {gallery}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Travel · winter
        </p>
        <p className="text-sm font-medium text-foreground">
          Five coasts this winter
        </p>
      </div>
      <div className="w-full" style={{ height: 240 }}>
        {gallery}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {index + 1} of {n}
        </span>{" "}
        · {items[index]?.caption ?? ""} · drag a drop or press →
      </p>
    </div>
  );
}
