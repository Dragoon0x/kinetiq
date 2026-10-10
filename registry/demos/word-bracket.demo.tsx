"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WordBracket } from "@/registry/ui/word-bracket";

export const tweaks = defineTweaks({
  interval: {
    kind: "range",
    label: "Interval",
    default: 1600,
    min: 800,
    max: 3000,
    step: 100,
    unit: "ms",
  },
  blur: {
    kind: "range",
    label: "Blur",
    default: 3,
    min: 0,
    max: 8,
    step: 0.5,
    unit: "px",
  },
  frame: {
    kind: "choice",
    label: "Frame",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--foreground)",
      "var(--signal)",
      "var(--warn)",
    ],
    names: {
      "var(--accent-bright)": "Accent",
      "var(--foreground)": "Ink",
      "var(--signal)": "Signal",
      "var(--warn)": "Amber",
    },
  },
});

const SENTENCE = "Pick a seat, pack light, and leave the rest to us.";
const WORDS = SENTENCE.split(" ");

/**
 * Waylight's trip planner hero: the focus frame walks the promise one idea
 * at a time, and a reader can take it to any word.
 */
export function WordBracketDemo({
  chrome = true,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);

  const hero = (
    <div className="flex w-full flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight · trip planner
      </p>
      <WordBracket
        text={SENTENCE}
        minLength={4}
        onIndexChange={setIndex}
        {...values}
        className="text-[clamp(1.375rem,5.2cqi,2.5rem)] leading-[1.25] font-semibold tracking-[-0.01em] text-balance text-foreground"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{hero}</div>;
  }

  const word = (WORDS[index] ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">frame on “{word}”</span> · word{" "}
        {index + 1} of {WORDS.length} · hover a word to hold it
      </p>
    </div>
  );
}
