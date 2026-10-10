"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TypeTrail, type TypeTrailState } from "@/registry/ui/type-trail";

export const tweaks = defineTweaks({
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 0.06,
    min: 0,
    max: 0.5,
    step: 0.02,
    unit: "em",
  },
  tail: {
    kind: "range",
    label: "Tail",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
});

const SAY: Record<TypeTrailState, [string, string]> = {
  rest: ["resting", "move across the card to write"],
  writing: ["writing", "the phrase follows the pen"],
  gathered: ["gathered", "set down under the pen"],
};

/**
 * Fieldline Notes' landing hero: wherever the visitor's pointer travels, it
 * writes the app's promise behind it, and sets it down neatly when it stops.
 */
export function TypeTrailDemo({
  chrome = true,
  // The pen is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<TypeTrailState>("rest");
  const [word, note] = SAY[state];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <TypeTrail
        text="take note of everything"
        onStateChange={setState}
        className="h-52 w-full rounded-3 border border-hairline bg-card font-medium"
        {...values}
      >
        <div className="flex h-full flex-col justify-center gap-1 px-6 pb-12">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fieldline Notes
          </p>
          <p className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
            Notes that keep up
          </p>
          <p className="text-sm font-normal text-ink-2">
            Write as fast as you think; Fieldline files it for you.
          </p>
        </div>
      </TypeTrail>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{word}</span> · {note}
        </p>
      ) : null}
    </div>
  );
}
