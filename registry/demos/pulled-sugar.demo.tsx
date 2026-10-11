"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PulledSugar } from "@/registry/ui/pulled-sugar";

export const tweaks = defineTweaks({
  stretch: {
    kind: "range",
    label: "Stretch",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gloss: {
    kind: "range",
    label: "Gloss",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "berry",
    options: ["berry", "mint", "honey", "lilac"],
    names: { berry: "Berry", mint: "Mint", honey: "Honey", lilac: "Lilac" },
  },
});

/**
 * Waylight Confectioners pull their taffy in the window every Saturday. Throw
 * an arm round to speed the machine up, or back to reverse it.
 */
export function PulledSugarDemo({
  chrome = true,
  // The machine is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rpm, setRpm] = React.useState(18);
  const [fold, setFold] = React.useState({ folds: 0, stripes: 3 });

  const machine = (
    <PulledSugar
      label="Waylight taffy puller speed"
      {...values}
      speed={rpm}
      onSpeedChange={setRpm}
      onFold={(folds, stripes) => setFold({ folds, stripes })}
      className="h-48"
    />
  );

  const caption = (
    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
      Waylight Confectioners · pulled to order
    </p>
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col items-center gap-2">
        {machine}
        {caption}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        {caption}
        <p className="text-sm font-medium text-foreground">
          Saturday taffy, in the window
        </p>
      </div>
      {machine}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {rpm === 0 ? "stopped" : `pulling ${Math.abs(rpm)} rpm`}
          {rpm < 0 ? " reversed" : ""}
        </span>{" "}
        · {fold.stripes} stripes · fold {fold.folds}
      </p>
    </div>
  );
}
