"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LetterDice } from "@/registry/ui/letter-dice";

export const tweaks = defineTweaks({
  tumble: {
    kind: "range",
    label: "Tumble",
    default: 0.8,
    min: 0.25,
    max: 1.5,
    step: 0.05,
  },
  spread: {
    kind: "range",
    label: "Spread",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  feltTone: {
    kind: "choice",
    label: "Felt",
    default: "green",
    options: ["green", "navy", "wine", "slate"],
    names: { green: "Green", navy: "Navy", wine: "Wine", slate: "Slate" },
  },
});

const WORDS = ["LUCKY", "DRAW", "AGAIN"];

/**
 * The Fieldline games club announces Friday night with a throw of letter
 * dice; every throw lands on the next word.
 */
export function LetterDiceDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState({ index: 0, rolling: false });
  const word = (WORDS[state.index] ?? "").toLowerCase();

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · games night
      </p>
      <LetterDice
        as="h2"
        words={WORDS}
        sound={sound}
        onThrow={(index) => setState({ index, rolling: true })}
        onComplete={(index) => setState({ index, rolling: false })}
        className="text-[11.5cqw] @md:text-[min(7.6cqw,3.2rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {state.rolling ? (
            <>
              <span className="text-signal">rolling</span> · {word.length} dice
              for {word}
            </>
          ) : (
            <>
              <span className="text-signal">landed</span> · {word} · Enter
              throws again
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
