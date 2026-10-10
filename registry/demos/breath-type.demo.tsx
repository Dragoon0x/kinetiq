"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BreathType } from "@/registry/ui/breath-type";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 2.5,
    min: 1,
    max: 5,
    step: 0.25,
    unit: "em",
  },
  falloff: {
    kind: "choice",
    label: "Falloff",
    default: "smooth",
    options: ["linear", "smooth", "sharp"],
    names: { linear: "Linear", smooth: "Smooth", sharp: "Sharp" },
  },
  axis: {
    kind: "choice",
    label: "Axis",
    default: "width",
    options: ["width", "weight", "optical"],
    names: { width: "Width", weight: "Weight", optical: "Optical" },
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.7,
    min: 0.2,
    max: 1,
    step: 0.05,
  },
});

/**
 * The opening line of a Coldbrook evening session: the words draw breath
 * toward the pointer and give it back as it leaves.
 */
export function BreathTypeDemo({
  chrome = true,
  // The breath is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [at, setAt] = React.useState<number | null>(null);
  const axis = values.axis ?? "width";

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · Evening session
        </p>
        <BreathType
          as="h2"
          onBreathChange={setAt}
          className="text-[1.9rem] leading-[1.2] font-semibold tracking-[-0.01em] text-foreground @md:text-[2.4rem] @xl:text-[3.4rem]"
          {...values}
        >
          Breathe in, slowly.
        </BreathType>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {at === null
            ? "resting · move across the words"
            : `breathing in · ${axis} axis`}
        </p>
      ) : null}
    </div>
  );
}
