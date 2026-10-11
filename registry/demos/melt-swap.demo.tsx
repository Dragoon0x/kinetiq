"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MeltSwap } from "@/registry/ui/melt-swap";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
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
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0.5,
    max: 1.5,
    step: 0.1,
  },
});

const WORDS = ["melted", "tempered", "poured", "set"] as const;

/**
 * Coldbrook Confectioners' hero: the process word in the middle of the line
 * pours from one step into the next, molten cocoa cooling into type.
 */
export function MeltSwapDemo({
  chrome = true,
  // The pour is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [settled, setSettled] = React.useState(0);
  const pouring = index !== settled;

  const hero = (
    <div className="@container flex w-full flex-col items-center gap-2 text-center">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Coldbrook · Single-origin bars
      </p>
      <h2 className="w-full text-[clamp(1.75rem,11cqi,3.25rem)] leading-[1.06] font-semibold tracking-tight text-balance text-foreground">
        Chocolate,
        <br />
        <MeltSwap
          words={WORDS}
          value={index}
          onValueChange={setIndex}
          onComplete={setSettled}
          liquidColor="light-dark(oklch(0.42 0.085 48), oklch(0.72 0.1 58))"
          className="text-[light-dark(oklch(0.36_0.06_45),oklch(0.86_0.055_70))]"
          {...values}
        />
        <br />
        by hand.
      </h2>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-md">{hero}</div>;

  const from = WORDS[settled] ?? "";
  const to = WORDS[index] ?? "";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {hero}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {pouring ? (
            <>
              <span className="text-signal">pouring</span> · {from} → {to}
            </>
          ) : (
            <>
              <span className="text-signal">
                word {settled + 1} of {WORDS.length}
              </span>{" "}
              · {to}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % WORDS.length)}
          className="inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Next word
        </button>
      </div>
    </div>
  );
}
