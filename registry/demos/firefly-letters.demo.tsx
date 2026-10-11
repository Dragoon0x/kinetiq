"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FireflyLetters } from "@/registry/ui/firefly-letters";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 450,
    min: 150,
    max: 900,
    step: 50,
  },
  blink: {
    kind: "range",
    label: "Blink",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shyness: {
    kind: "range",
    label: "Shyness",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline's guided night walks: the season's headline is written by the
 * fireflies the walks go out to see.
 */
export function FireflyLettersDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  void sound;
  // Only the state is kept, not the count, so the page re-renders when the
  // word breaks or comes whole, not for every firefly that lands.
  const [phase, setPhase] = React.useState<"dusk" | "whole" | "scattered">(
    "dusk",
  );
  const lights = values.count ?? tweaks.count.default;

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · night walks
      </p>
      <FireflyLetters
        as="h2"
        text="Summer nights"
        onScatter={(away) => setPhase(away === 0 ? "whole" : "scattered")}
        className="w-full text-center text-[11.5cqw] leading-[1.05] font-semibold tracking-[-0.01em] @md:text-[min(9cqw,4.25rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {phase === "dusk" ? (
            <>
              <span className="text-signal">dusk</span> · the lights are coming
              in
            </>
          ) : phase === "whole" ? (
            <>
              <span className="text-signal">whole</span> · {lights} lights ·
              move near them
            </>
          ) : (
            <>
              <span className="text-signal">scattered</span> · finding their way
              back
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
