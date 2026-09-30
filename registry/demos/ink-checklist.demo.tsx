"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  InkChecklist,
  type InkChecklistItem,
} from "@/registry/ui/ink-checklist";

export const tweaks = defineTweaks({
  ink: {
    kind: "choice",
    label: "Ink",
    default: "blue",
    options: ["blue", "black", "red"],
    names: { blue: "Blue", black: "Black", red: "Red" },
  },
  strike: { kind: "toggle", label: "Strike", default: true },
  wobble: {
    kind: "range",
    label: "Wobble",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const ITEMS: InkChecklistItem[] = [
  { id: "charge", label: "Charge the base station" },
  { id: "level", label: "Calibrate the level" },
  { id: "batteries", label: "Pack spare batteries" },
  { id: "weather", label: "Log the weather" },
  { id: "permit", label: "Sign the site permit" },
];

/**
 * A Fieldline crew's list before a survey day: two things are already done,
 * the rest are ticked off by hand.
 */
export function InkChecklistDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [done, setDone] = React.useState<string[]>(["charge", "level"]);
  const next = ITEMS.find((i) => !done.includes(i.id));

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <InkChecklist
        label="Before you set out"
        items={ITEMS}
        value={done}
        onValueChange={setDone}
        name="checks"
        className="max-w-xs self-center"
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {next ? (
            <>
              <span className="text-signal">
                {done.length} of {ITEMS.length} done
              </span>{" "}
              · next: {next.label}
            </>
          ) : (
            <>
              <span className="text-signal">all {ITEMS.length} done</span> ·
              ready to set out
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
