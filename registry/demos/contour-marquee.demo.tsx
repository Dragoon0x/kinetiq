"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ContourMarquee } from "@/registry/ui/contour-marquee";

export const tweaks = defineTweaks({
  curve: {
    kind: "choice",
    label: "Curve",
    default: "wave",
    options: ["wave", "arch", "loop"],
    names: { wave: "Wave", arch: "Arch", loop: "Loop" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 2.5,
    min: 0.5,
    max: 6,
    step: 0.5,
    unit: "em/s",
  },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
});

/**
 * Fernworks' spring firing: the studio's announcement rides along the top of
 * the shop page, and a visitor can catch it and throw it round.
 */
export function ContourMarqueeDemo({
  chrome = true,
  // The line is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [paused, setPaused] = React.useState(false);
  const [scrubbing, setScrubbing] = React.useState(false);
  const motionSafe = useMotionSafe();
  const speed = values.speed ?? tweaks.speed.default;

  return (
    <div className="@container flex w-full max-w-3xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks · spring kiln
      </p>
      <div className="text-[clamp(1.1rem,4.5cqi,1.75rem)] font-medium tracking-[-0.01em] text-foreground">
        <ContourMarquee
          as="h2"
          text="Thirty new glazes, fresh from the kiln"
          paused={paused}
          onPausedChange={setPaused}
          onScrubChange={setScrubbing}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {scrubbing ? (
            <>
              <span className="text-signal">held</span> · scrubbing along the
              curve
            </>
          ) : paused ? (
            <>
              <span className="text-signal">paused</span> · press to resume
            </>
          ) : !motionSafe ? (
            <>
              <span className="text-signal">still</span> · drag the line to read
              on
            </>
          ) : (
            <>
              <span className="text-signal">cruising</span> · {speed} em/s ·
              drag the line to scrub
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
