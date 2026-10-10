"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CascadeSplit } from "@/registry/ui/cascade-split";

export const tweaks = defineTweaks({
  by: {
    kind: "choice",
    label: "By",
    default: "letter",
    options: ["letter", "word", "line"],
    names: { letter: "Letter", word: "Word", line: "Line" },
  },
  motion: {
    kind: "choice",
    label: "Motion",
    default: "rise",
    options: ["rise", "drop", "swing"],
    names: { rise: "Rise", drop: "Drop", swing: "Swing" },
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 30,
    min: 10,
    max: 80,
    step: 5,
    unit: "ms",
  },
});

type Phase = "arriving" | "in" | "leaving" | "out";

/**
 * Fieldline files its surveyors' notes the day they are taken: the headline
 * of its field book arrives piece by piece, and leaves the same way.
 */
export function CascadeSplitDemo({
  chrome = true,
  // The pieces land silently: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [shown, setShown] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>("arriving");
  const by = values.by ?? tweaks.by.default;
  const motion = values.motion ?? tweaks.motion.default;

  const headline = (
    <CascadeSplit
      as="h2"
      text="Every field, noted on time"
      trigger={chrome ? "manual" : "inView"}
      play={shown}
      onComplete={(state) => setPhase(state)}
      className="text-[clamp(2rem,9.5cqw,4.25rem)] leading-[1.1] font-semibold tracking-tight text-foreground"
      {...values}
    />
  );

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline · field notes
      </p>
      {headline}
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">
              {phase === "in" ? "arrived" : phase === "out" ? "left" : phase}
            </span>{" "}
            · by {by} · {motion}
          </p>
          <button
            type="button"
            onClick={() => {
              setPhase(shown ? "leaving" : "arriving");
              setShown((on) => !on);
            }}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {shown ? "Leave" : "Arrive"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
