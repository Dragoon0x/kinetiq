"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SkylineBrush,
  defaultSkylineBrushDistricts,
} from "@/registry/ui/skyline-brush";

export const tweaks = defineTweaks({
  maxHeight: {
    kind: "range",
    label: "Max height",
    default: 36,
    min: 8,
    max: 60,
    step: 2,
    unit: "fl",
  },
  falloff: {
    kind: "range",
    label: "Falloff",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lights: {
    kind: "range",
    label: "Lights",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Waylight's 2040 massing study: the city plan on the planning office's
 * table, brushed into towers to argue about where the height goes.
 */
export function SkylineBrushDemo({
  chrome = true,
  // The plan is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [pinned, setPinned] = React.useState<string | null>(null);

  const plan = (
    <div className="relative size-full">
      <SkylineBrush value={pinned} onValueChange={setPinned} {...values} />
      <p className="pointer-events-none absolute top-3 left-3 z-10 inline-flex items-center rounded-full border border-hairline bg-card/80 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
        Waylight · 2040 massing study
      </p>
    </div>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 548 }}>
        {plan}
      </div>
    );
  }

  const district = defaultSkylineBrushDistricts.find((d) => d.id === pinned);
  const max = Math.round(values.maxHeight ?? tweaks.maxHeight.default);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="w-full" style={{ height: 460 }}>
        {plan}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {district ? `pinned ${district.name}` : "brush the plan"}
        </span>{" "}
        · towers up to {max} floors · {defaultSkylineBrushDistricts.length}{" "}
        districts
      </p>
    </div>
  );
}
