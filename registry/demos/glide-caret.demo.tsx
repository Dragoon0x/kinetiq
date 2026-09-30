"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { GlideCaret } from "@/registry/ui/glide-caret";

export const tweaks = defineTweaks({
  stiffness: {
    kind: "range",
    label: "Stiffness",
    default: 600,
    min: 150,
    max: 1200,
    step: 50,
  },
  stretch: {
    kind: "range",
    label: "Stretch",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  width: {
    kind: "range",
    label: "Width",
    default: 2,
    min: 1,
    max: 4,
    step: 0.5,
    unit: "px",
  },
  blink: {
    kind: "choice",
    label: "Blink",
    default: "smooth",
    options: ["smooth", "step", "none"],
    names: { smooth: "Smooth", step: "Step", none: "Off" },
  },
});

const NOTE =
  "Flow steady at the upper gauge, clear water.\nLower gauge reads high again; check the intake grate before Friday.";

const wordsIn = (text: string) => {
  const n = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
  return `${n} ${n === 1 ? "word" : "words"}`;
};

/**
 * A Fieldline field note from the Coldbrook weir, already half written.
 * Click into it, type, select a phrase: the caret glides to each place.
 */
export function GlideCaretDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [note, setNote] = React.useState(NOTE);

  const field = (
    <GlideCaret
      label="Field note · Coldbrook weir"
      value={note}
      onValueChange={setNote}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-md">{field}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            Morning reading
          </p>
          <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
            Fieldline · 07:40
          </span>
        </div>
        {field}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">field note</span> · {wordsIn(note)}
      </p>
    </div>
  );
}
