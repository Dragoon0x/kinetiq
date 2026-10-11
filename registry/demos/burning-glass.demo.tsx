"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BurningGlass,
  defaultBurningGlassImages,
  type BurningGlassStage,
} from "@/registry/ui/burning-glass";

export const tweaks = defineTweaks({
  focus: {
    kind: "range",
    label: "Focus",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  burnRate: {
    kind: "range",
    label: "Burn rate",
    default: 1,
    min: 0.25,
    max: 2,
    step: 0.25,
  },
  scorch: {
    kind: "range",
    label: "Scorch",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PLACES = ["Dunes at noon", "Harbour at dusk", "Pines at night"];

const SAID: Record<BurningGlassStage, string> = {
  idle: "hold the glass still",
  warming: "warming",
  browning: "browning",
  smoking: "smoking",
  burning: "caught · burning through",
};

/**
 * Waylight Journeys: three trips in one frame, and the way to the next is
 * to burn through this one.
 */
export function BurningGlassDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [stage, setStage] = React.useState<BurningGlassStage>("idle");
  const place = PLACES[index] ?? "";

  const frame = (
    <div className="relative w-full">
      <BurningGlass
        images={defaultBurningGlassImages}
        value={index}
        onValueChange={setIndex}
        onStageChange={setStage}
        className={cn("w-full rounded-3", chrome ? "h-56" : "h-52")}
        sound={sound}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-3 rounded-full border border-hairline bg-card/85 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
        Waylight · {place}
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{frame}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {frame}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{place.toLowerCase()}</span> ·{" "}
        {SAID[stage]}
      </p>
    </div>
  );
}
