"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StackExtrude } from "@/registry/ui/stack-extrude";

export const tweaks = defineTweaks({
  layers: {
    kind: "range",
    label: "Layers",
    default: 12,
    min: 4,
    max: 24,
    step: 1,
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.3,
    min: 0.05,
    max: 0.5,
    step: 0.05,
    unit: "em",
  },
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 12,
    min: 0,
    max: 24,
    step: 2,
    unit: "°",
  },
});

type Mode = "flat" | "lifted" | "pressed";

/**
 * Basinworks casts stone: the headline of its catalogue stands up off the
 * page in solid letters, and gives under a press.
 */
export function StackExtrudeDemo({
  chrome = true,
  // The blocks are silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [mode, setMode] = React.useState<Mode>("flat");

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks · cast stone
      </p>
      <StackExtrude
        as="h2"
        text="Poured Stone"
        onComplete={() => setMode("lifted")}
        onPressChange={(down) => setMode(down ? "pressed" : "lifted")}
        className="text-[clamp(2.5rem,13cqw,5.25rem)] leading-[1.05] font-bold tracking-tight"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {mode === "flat" ? (
            <>
              <span className="text-signal">flat</span> · printed on the page
            </>
          ) : mode === "pressed" ? (
            <>
              <span className="text-signal">pressed</span> · into the page
            </>
          ) : (
            <>
              <span className="text-signal">lifted</span> · move to turn it,
              press to set it down
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
