"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BranchDraft, type BranchDraftStep } from "@/registry/ui/branch-draft";

export const tweaks = defineTweaks({
  candidates: {
    kind: "range",
    label: "Candidates",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  ghostOpacity: {
    kind: "range",
    label: "Ghosts",
    default: 0.45,
    min: 0.15,
    max: 0.8,
    step: 0.05,
  },
});

const STEPS: BranchDraftStep[] = [
  { text: "Plan the week" },
  {
    text: " around your best hours",
    alternates: [
      " before it plans you",
      " in one calm view",
      " without the guesswork",
    ],
  },
  {
    text: ", not your inbox.",
    alternates: [
      ", then guard it.",
      ", one block at a time.",
      ", and keep it.",
    ],
  },
];

type Story =
  { kind: "writing" } | { kind: "chose"; words: string } | { kind: "written" };

/**
 * Gaugeworks Planner's landing line, thinking out loud before it commits:
 * the docs plate lets the reader pick the words.
 */
export function BranchDraftDemo({
  chrome = true,
  // The draft is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "writing" });

  const headline = (
    <div className="@container w-full">
      <BranchDraft
        steps={STEPS}
        as="h2"
        interactive={chrome}
        onStep={(_, words) => setStory({ kind: "chose", words: words.trim() })}
        onComplete={() => setStory({ kind: "written" })}
        className="text-[clamp(1.375rem,5.2cqi,2.25rem)] leading-[1.12] font-semibold tracking-tight text-foreground"
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return (
      <div className="flex w-full flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · planner
        </p>
        {headline}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Gaugeworks · planner
      </p>
      {headline}
      <p className="text-sm text-ink-2">
        A calendar that protects focus time first and fits the rest around it.
      </p>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "writing" ? (
          <>
            <span className="text-signal">weighing the next words</span> ·
            arrows choose, tab accepts
          </>
        ) : story.kind === "chose" ? (
          <>
            <span className="text-signal">chose</span> · “{story.words}”
          </>
        ) : (
          <>
            <span className="text-signal">written</span> · drafting again soon
          </>
        )}
      </p>
    </div>
  );
}
