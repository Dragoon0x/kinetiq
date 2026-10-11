"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CutoutLetters } from "@/registry/ui/cutout-letters";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Reach",
    default: 2,
    min: 0.8,
    max: 4,
    step: 0.2,
    unit: "em",
  },
  foldAngle: {
    kind: "range",
    label: "Fold",
    default: 120,
    min: 30,
    max: 170,
    step: 10,
    unit: "°",
  },
  paperTone: {
    kind: "choice",
    label: "Stock",
    default: "cream",
    options: ["cream", "kraft", "slate", "blush"],
    names: { cream: "Cream", kraft: "Kraft", slate: "Slate", blush: "Blush" },
  },
});

/**
 * Gaugeworks Paper Co. die-cuts its own stationery: the headline on its
 * sample card is cut too, and the letters lift out as the visitor's hand
 * comes near.
 */
export function CutoutLettersDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [near, setNear] = React.useState<number | null>(null);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · paper goods
      </p>
      <CutoutLetters
        as="h2"
        text="Cut from card"
        onFold={setNear}
        sound={sound}
        className="w-fit max-w-full text-[12.5cqw] leading-[1.15] font-bold tracking-[0.02em] @md:text-[min(8.6cqw,3.75rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {near === null ? (
            <>
              <span className="text-signal">flat</span> · move near the letters
            </>
          ) : (
            <>
              <span className="text-signal">lifting</span> · letter {near + 1}{" "}
              and its neighbours
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
