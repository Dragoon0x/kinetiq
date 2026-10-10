"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DrumWords } from "@/registry/ui/drum-words";

export const tweaks = defineTweaks({
  interval: {
    kind: "range",
    label: "Interval",
    default: 2400,
    min: 1200,
    max: 4800,
    step: 200,
    unit: "ms",
  },
  depth: {
    kind: "range",
    label: "Depth",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  width: {
    kind: "choice",
    label: "Width",
    default: "fit",
    options: ["fit", "widest"],
    names: { fit: "Fit", widest: "Widest" },
  },
});

const WORDS = [
  "field crews",
  "survey teams",
  "harbour pilots",
  "night rangers",
  "everyone outside",
];

/**
 * Fieldline's landing hero: maps that work offline, and the people they are
 * for, turning on the drum.
 */
export function DrumWordsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const hero = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · maps that work offline
      </p>
      <DrumWords
        words={WORDS}
        before={"We build maps for\n"}
        after="."
        paused={paused}
        onIndexChange={setIndex}
        sound={sound}
        className="text-[clamp(24px,7.6cqi,46px)] leading-[1.12] font-semibold tracking-[-0.02em] text-foreground"
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{hero}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {hero}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{paused ? "held" : "turning"}</span> ·{" "}
          {index + 1} of {WORDS.length} · {WORDS[index]}
        </p>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
