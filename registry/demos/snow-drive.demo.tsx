"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SnowDrive } from "@/registry/ui/snow-drive";

export const tweaks = defineTweaks({
  snowfall: {
    kind: "range",
    label: "Snowfall",
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 60,
    min: 20,
    max: 140,
    step: 10,
    unit: "km/h",
  },
  beam: {
    kind: "choice",
    label: "Beam",
    default: "halogen",
    options: ["halogen", "xenon", "amber", "led"],
    names: { halogen: "Halogen", xenon: "Xenon", amber: "Amber", led: "LED" },
  },
  wind: {
    kind: "range",
    label: "Wind",
    default: 0.25,
    min: -1,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Winter Roads: the service that tells you which roads are clear,
 * over the drive home it is for.
 */
export function SnowDriveDemo({
  chrome = true,
  // The scene is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [boosting, setBoosting] = React.useState(false);
  const speed = values.speed ?? tweaks.speed.default;

  const drive = (
    <SnowDrive
      onBoostChange={setBoosting}
      label="Coldbrook Winter Roads, night drive in falling snow"
      className="h-full w-full"
      {...values}
    >
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
        Coldbrook Winter Roads
      </p>
      <p className="text-sm font-medium text-foreground">Drive home safe</p>
    </SnowDrive>
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {drive}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="w-full" style={{ height: 248 }}>
        {drive}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {boosting ? (
          <>
            <span className="text-signal">speeding up</span> · let go to ease
            back
          </>
        ) : (
          <>
            <span className="text-signal">cruising · {speed} km/h</span> · hold
            to speed up
          </>
        )}
      </p>
    </div>
  );
}
