"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { WeightField } from "@/registry/ui/weight-field";

export const tweaks = defineTweaks({
  radius: {
    kind: "range",
    label: "Radius",
    default: 2.5,
    min: 1,
    max: 5,
    step: 0.25,
    unit: "em",
  },
  minWeight: {
    kind: "range",
    label: "Min weight",
    default: 400,
    min: 400,
    max: 550,
    step: 25,
  },
  maxWeight: {
    kind: "range",
    label: "Max weight",
    default: 700,
    min: 550,
    max: 700,
    step: 25,
  },
});

const LINE = "Lean into it.";
const LETTERS = Array.from(LINE.replace(/\s/g, ""));

/**
 * Fieldline Strength's spring intake: the headline flexes once as it
 * arrives, then bulks up wherever the visitor leans on it.
 */
export function WeightFieldDemo({
  chrome = true,
  // Type is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [leaning, setLeaning] = React.useState<number | null>(null);
  const lo = values.minWeight ?? tweaks.minWeight.default;
  const hi = values.maxWeight ?? tweaks.maxWeight.default;

  const hero = (
    <div className="@container flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Strength · Spring intake
      </p>
      <WeightField
        as="h2"
        align="start"
        onLean={setLeaning}
        className="text-[clamp(1.75rem,12cqi,4.25rem)] leading-[1.05] tracking-[-0.015em] text-foreground"
        {...values}
      >
        {LINE}
      </WeightField>
      <p className="text-sm text-ink-2">
        Spring intake opens Monday. Coaching from six in the morning.
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{hero}</div>;

  const letter = leaning === null ? null : LETTERS[leaning];
  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {hero}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{letter ? "leaning" : "relaxed"}</span>
        {letter ? ` · on “${letter}”` : ""} · weight {lo}–{hi}
      </p>
    </div>
  );
}
