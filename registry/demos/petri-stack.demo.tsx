"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultPetriItems, PetriStack } from "@/registry/ui/petri-stack";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 55,
    min: 20,
    max: 70,
    step: 5,
    unit: "°",
  },
  gap: {
    kind: "range",
    label: "Gap",
    default: 12,
    min: 4,
    max: 24,
    step: 2,
    unit: "px",
  },
  glass: {
    kind: "choice",
    label: "Glass",
    default: "clear",
    options: ["clear", "sea", "amber", "smoke"],
    names: { clear: "Clear", sea: "Sea", amber: "Amber", smoke: "Smoke" },
  },
});

/**
 * Fieldline Lab's culture log: this week's plates, stacked on the bench.
 * Click through them, or flick the top one aside.
 */
export function PetriStackDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [top, setTop] = React.useState(0);
  const item = defaultPetriItems[top];
  const glass = values.glass ?? tweaks.glass.default;

  if (!chrome) {
    return (
      <div className="flex w-full">
        <PetriStack
          label="Culture log"
          value={top}
          onValueChange={setTop}
          sound={sound}
          height={224}
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Lab · culture log
        </p>
        <p className="text-base font-medium text-foreground">
          This week&rsquo;s plates
        </p>
      </div>
      <div className="rounded-4 border border-hairline bg-surface-1">
        <PetriStack
          label="Culture log"
          value={top}
          onValueChange={setTop}
          sound={sound}
          height={260}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{item?.caption?.toLowerCase()}</span> ·{" "}
        {top + 1} of {defaultPetriItems.length} · {glass} glass
      </p>
    </div>
  );
}
