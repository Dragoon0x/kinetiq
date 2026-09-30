"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LensSweep } from "@/registry/ui/lens-sweep";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  zoom: {
    kind: "range",
    label: "Zoom",
    default: 1.5,
    min: 1.2,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  blur: {
    kind: "range",
    label: "Blur",
    default: 1.5,
    min: 0,
    max: 4,
    step: 0.25,
    unit: "px",
  },
  lens: {
    kind: "choice",
    label: "Lens",
    default: "round",
    options: ["round", "bar"],
    names: { round: "Loupe", bar: "Bar" },
  },
});

const PHRASES = [
  "Reading the terms",
  "Checking each clause",
  "Comparing the dates",
];

/**
 * Fieldline reviewing a lease renewal before it is signed: the status line is
 * read over, word by word, while the review runs.
 */
export function LensSweepDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [reviewing, setReviewing] = React.useState(true);
  const [phrase, setPhrase] = React.useState(0);
  const [word, setWord] = React.useState(0);
  const words = (PHRASES[phrase] ?? "").split(" ").length;

  const line = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · lease renewal
      </p>
      <LensSweep
        phrases={PHRASES}
        active={reviewing}
        doneText="Contract reviewed"
        onPhraseChange={(i) => {
          setPhrase(i);
          setWord(0);
        }}
        onWordChange={setWord}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{line}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {line}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {reviewing && phrase >= 0 ? (
            <>
              <span className="text-signal">reading</span> · word{" "}
              {Math.min(words, word + 1)} of {words} · drag the lens
            </>
          ) : (
            <>
              <span className="text-signal">reviewed</span> · no changes
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setReviewing((r) => !r)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {reviewing ? "Finish" : "Review again"}
        </button>
      </div>
    </div>
  );
}
