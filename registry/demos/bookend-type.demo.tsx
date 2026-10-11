"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BookendType, type BookendTypePhase } from "@/registry/ui/bookend-type";

export const tweaks = defineTweaks({
  leanAngle: {
    kind: "range",
    label: "Lean",
    default: 16,
    min: 6,
    max: 30,
    step: 2,
    unit: "°",
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
  shelf: {
    kind: "choice",
    label: "Shelf",
    default: "wood",
    options: ["wood", "steel", "none"],
    names: { wood: "Wood", steel: "Steel", none: "None" },
  },
});

const WORDS = ["Fiction", "Poetry", "Essays", "Travel"];

const HINT: Record<BookendTypePhase, string> = {
  standing: "press to nudge",
  slumping: "the lean runs down",
  slumped: "press to tidy",
  tidying: "the bookend pushes",
};

/**
 * Fernworks Books labels its shelves the way they behave: each section's
 * name slumps over, and the bookend tidies it up again.
 */
export function BookendTypeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [phase, setPhase] = React.useState<BookendTypePhase>("standing");

  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Books · shelf 4
      </p>
      <BookendType
        as="h2"
        words={WORDS}
        sound={sound}
        onWordChange={setIndex}
        onPhaseChange={setPhase}
        className="text-[13cqw] font-semibold tracking-normal text-foreground @md:text-[min(10cqw,5rem)]"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{phase}</span> ·{" "}
          {(WORDS[index] ?? "").toLowerCase()} · {HINT[phase]}
        </p>
      ) : null}
    </div>
  );
}
