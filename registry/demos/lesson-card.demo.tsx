"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  LessonCard,
  defaultActivity,
  defaultLessons,
} from "@/registry/ui/lesson-card";

export const tweaks = defineTweaks({
  ring: {
    kind: "choice",
    label: "Ring",
    default: "thick",
    options: ["thin", "thick", "segmented"],
    names: { thin: "Thin", thick: "Thick", segmented: "Per lesson" },
  },
  peek: {
    kind: "range",
    label: "Peek",
    default: 0.75,
    min: 0,
    max: 1,
    step: 0.05,
  },
  streak: {
    kind: "range",
    label: "Streak",
    default: 14,
    min: 0,
    max: 21,
    step: 7,
    unit: "days",
  },
});

const START = 6;

/** Trailing active days before today in the sample activity. */
const runBefore = (() => {
  let run = 0;
  for (let i = defaultActivity.length - 2; i >= 0; i -= 1) {
    if (!defaultActivity[i]) break;
    run += 1;
  }
  return run;
})();

/**
 * Fieldline Academy's pricing course, six lessons in, with a four-day streak
 * that today's lesson would extend.
 */
export function LessonCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lesson, setLesson] = React.useState(START);
  const [studied, setStudied] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const n = defaultLessons.length;
  const share = Math.round((Math.min(lesson, n) / n) * 100);
  const run = runBefore + (studied ? 1 : 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <LessonCard
        key={round}
        lesson={lesson}
        onLessonChange={setLesson}
        onContinue={() => setStudied(true)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {lesson >= n ? (
              <>
                <span className="text-signal">course complete</span> · 100%
              </>
            ) : (
              <>
                <span className="text-signal">
                  lesson {lesson + 1} of {n}
                </span>
                {` · ${share}% done · ${run}-day streak`}
              </>
            )}
          </p>
          <button
            type="button"
            disabled={lesson === START && !studied}
            onClick={() => {
              setLesson(START);
              setStudied(false);
              setRound((r) => r + 1);
            }}
            className={cn(
              "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none",
              "hover:bg-surface-2 hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
            )}
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}
