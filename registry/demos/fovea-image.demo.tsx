"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FoveaImage, type FoveaImageGaze } from "@/registry/ui/fovea-image";

export const tweaks = defineTweaks({
  blockSize: {
    kind: "range",
    label: "Block",
    default: 20,
    min: 8,
    max: 40,
    step: 2,
    unit: "px",
  },
  fovea: {
    kind: "range",
    label: "Fovea",
    default: 48,
    min: 20,
    max: 120,
    step: 5,
    unit: "px",
  },
  steps: {
    kind: "range",
    label: "Steps",
    default: 2,
    min: 1,
    max: 4,
    step: 1,
  },
});

/**
 * Coldbrook Harbour Authority's evening berths: the harbour at dusk, sharp
 * only where you look.
 */
export function FoveaImageDemo({
  chrome = true,
  // The picture is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [gaze, setGaze] = React.useState<FoveaImageGaze | null>(null);

  const figure = (
    <FoveaImage
      caption="Evening berths · Coldbrook harbour"
      onGazeChange={setGaze}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 208 }}>
        {figure}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook Harbour Authority · tonight
      </p>
      <div className="w-full" style={{ height: 240 }}>
        {figure}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {gaze ? (
          <>
            <span className="text-signal">looking</span> ·{" "}
            {Math.round(gaze.x * 100)}% across, {Math.round(gaze.y * 100)}% down
          </>
        ) : (
          <>
            <span className="text-signal">at rest</span> · sharp all over
          </>
        )}
      </p>
    </div>
  );
}
