"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlasmaBloom } from "@/registry/ui/plasma-bloom";

export const tweaks = defineTweaks({
  palette: {
    kind: "choice",
    label: "Palette",
    default: "denim",
    options: ["linen", "sage", "denim", "clay"],
    names: { linen: "Linen", sage: "Sage", denim: "Denim", clay: "Clay" },
  },
  scale: {
    kind: "range",
    label: "Scale",
    default: 280,
    min: 120,
    max: 480,
    step: 20,
    unit: "px",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 0.5,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * Coldbrook Knitwear's autumn edit: the hero is the season's colourways,
 * printed as moving cloth behind the offer.
 */
export function PlasmaBloomDemo({
  chrome = true,
  // The cloth is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // Reduced motion holds the field still, whatever the speed says.
  const motionSafe = useMotionSafe();
  const [ringing, setRinging] = React.useState(false);
  const palette = values.palette ?? "denim";
  const scale = values.scale ?? 280;
  const speed = values.speed ?? 0.5;

  const cloth = (
    <PlasmaBloom
      onActiveChange={setRinging}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Knitwear
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Colour that moves like cloth
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Twelve pieces in four colourways
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Shop the edit
              </button>
            </>
          ) : null}
        </div>
      </div>
    </PlasmaBloom>
  );

  if (!chrome) return <div className="flex w-full">{cloth}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {cloth}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ringing ? (
          <>
            <span className="text-signal">rings</span> · interference under your
            hand
          </>
        ) : (
          <>
            <span className="text-signal">{palette}</span> · scale {scale} px ·{" "}
            {speed > 0 && motionSafe ? "drifting" : "still"}
          </>
        )}
      </p>
    </div>
  );
}
