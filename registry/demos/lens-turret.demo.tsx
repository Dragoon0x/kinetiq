"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultLensTurretItems, LensTurret } from "@/registry/ui/lens-turret";

export const tweaks = defineTweaks({
  lensCount: {
    kind: "range",
    label: "Lenses",
    default: 4,
    min: 3,
    max: 6,
    step: 1,
  },
  blur: {
    kind: "range",
    label: "Blur",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  detentStrength: {
    kind: "range",
    label: "Detent",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const FOCAL = ["16", "25", "50", "75", "100", "135"];

/**
 * Gaugeworks Cine, test reel 04: a turret of lenses, each holding a frame
 * from the reel, and the one in the gate thrown on the screen behind.
 */
export function LensTurretDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lens, setLens] = React.useState(0);
  const items = defaultLensTurretItems;
  const count = Math.round(values.lensCount ?? tweaks.lensCount.default);
  const shown = lens % count;

  const turret = (
    <LensTurret
      items={items}
      focalLengths={FOCAL}
      value={shown}
      onValueChange={setLens}
      label="Gaugeworks lens turret"
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 520 }}>
        {turret}
      </div>
    );
  }

  const item = items[shown % items.length];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Cine · test reel 04
        </p>
        <p className="text-sm font-medium text-foreground">
          Flick the turret, or use the arrow keys
        </p>
      </div>
      <div className="w-full" style={{ height: 420 }}>
        {turret}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">lens {shown + 1}</span> of {count} ·{" "}
        {FOCAL[shown % FOCAL.length]} mm · {item?.caption ?? item?.alt}
      </p>
    </div>
  );
}
