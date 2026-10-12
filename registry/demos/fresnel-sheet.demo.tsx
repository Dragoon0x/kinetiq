"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  FresnelSheet,
  type FresnelSheetPosition,
} from "@/registry/ui/fresnel-sheet";

export const tweaks = defineTweaks({
  rings: {
    kind: "range",
    label: "Rings",
    default: 16,
    min: 4,
    max: 40,
    step: 2,
  },
  magnify: {
    kind: "range",
    label: "Magnify",
    default: 2.2,
    min: 1.2,
    max: 4,
    step: 0.1,
    unit: "×",
  },
  glare: {
    kind: "range",
    label: "Glare",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Basinworks Charts, sheet 4: the printed chart of Coldbrook Bay with a
 * Fresnel sheet on it that shows the bay as it looks from the air.
 */
export function FresnelSheetDemo({
  chrome = true,
  // The sheet slides in silence: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState<FresnelSheetPosition>({
    x: 0.62,
    y: 0.5,
  });

  const sheet = (
    <FresnelSheet
      label="Fresnel sheet over Coldbrook Bay"
      onPositionChange={setAt}
      className={chrome ? "h-[232px] w-full" : "h-[208px] w-full"}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full">{sheet}</div>;

  const magnify = values.magnify ?? tweaks.magnify.default;
  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">Coldbrook Bay</p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Basinworks Charts · Sheet 4
        </p>
      </div>
      {sheet}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          sheet at {Math.round(at.x * 100)}% across
        </span>
        {` · ${Math.round(at.y * 100)}% down · ${magnify.toFixed(1)}×`}
      </p>
    </div>
  );
}
