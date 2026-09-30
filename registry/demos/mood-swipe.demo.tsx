"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MoodSwipe } from "@/registry/ui/mood-swipe";

export const tweaks = defineTweaks({
  stops: {
    kind: "range",
    label: "Stops",
    default: 5,
    min: 3,
    max: 7,
    step: 2,
  },
  face: {
    kind: "choice",
    label: "Face",
    default: "filled",
    options: ["filled", "line", "duo"],
    names: { filled: "Filled", line: "Line", duo: "Duotone" },
  },
  colour: {
    kind: "choice",
    label: "Colour",
    default: "mood",
    options: ["mood", "accent", "ink"],
    names: { mood: "Mood", accent: "Accent", ink: "Ink" },
  },
  snap: { kind: "toggle", label: "Snap", default: true },
});

const WORDS: Record<number, readonly string[]> = {
  3: ["unhappy", "okay", "happy"],
  5: ["awful", "poor", "okay", "good", "great"],
  7: ["awful", "bad", "poor", "okay", "good", "great", "superb"],
};

/**
 * Fernworks asks how order FW-4410's delivery went. Swipe the face toward
 * a grin or a frown; it lands on the nearest answer.
 */
export function MoodSwipeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [mood, setMood] = React.useState(0.5);
  const stops = values.stops ?? 5;
  const snap = values.snap ?? true;
  const k = Math.round(mood * (stops - 1));
  const word = WORDS[stops]?.[k] ?? "";

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <div className="flex w-full flex-col items-center gap-0.5 text-center">
        <p className="text-sm font-medium text-foreground">
          How was your delivery?
        </p>
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fernworks · order FW-4410
        </p>
      </div>
      <MoodSwipe
        label="How was your Fernworks delivery?"
        value={mood}
        onValueChange={setMood}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{word}</span>
          {snap
            ? ` · ${k + 1} of ${stops} · swipe the face`
            : ` · ${Math.round(mood * 100)}%`}
        </p>
      ) : null}
    </div>
  );
}
