"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CreaseSwap } from "@/registry/ui/crease-swap";

export const tweaks = defineTweaks({
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 70,
    min: 20,
    max: 160,
    step: 10,
    unit: "ms",
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  paperTone: {
    kind: "choice",
    label: "Paper",
    default: "indigo",
    options: ["indigo", "vermilion", "sage", "kraft"],
    names: { indigo: "Indigo", vermilion: "Red", sage: "Sage", kraft: "Kraft" },
  },
});

/**
 * Coldbrook's tap list: the board says what is pouring, and turned over, how
 * it was made.
 */
export function CreaseSwapDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [latched, setLatched] = React.useState(false);
  const [face, setFace] = React.useState(false);

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook · on tap
      </p>
      <div className="flex justify-center">
        <CreaseSwap
          as="h2"
          text="Cold brew"
          back="Slow made"
          pressed={latched}
          onPressedChange={setLatched}
          onTurn={setFace}
          sound={sound}
          className="text-[6.6cqw] font-semibold @md:text-[min(7cqw,3.5rem)]"
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {face ? (
            <>
              <span className="text-signal">turned</span> · slow made
              {latched ? " · latched" : ""}
            </>
          ) : (
            <>
              <span className="text-signal">front</span> · cold brew · hover or
              press
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
