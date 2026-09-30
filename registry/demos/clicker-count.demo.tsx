"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ClickerCount } from "@/registry/ui/clicker-count";

export const tweaks = defineTweaks({
  digits: {
    kind: "range",
    label: "Digits",
    default: 4,
    min: 3,
    max: 5,
    step: 1,
  },
  travel: {
    kind: "range",
    label: "Travel",
    default: 8,
    min: 4,
    max: 12,
    step: 1,
    unit: "px",
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "steel",
    options: ["steel", "brass", "matte"],
    names: { steel: "Steel", brass: "Brass", matte: "Matte" },
  },
  carry: { kind: "toggle", label: "Carry", default: true },
});

/**
 * Basinworks, Gate B: a steward counts arrivals through the gate by hand.
 * The count starts at 97, so the carry into the hundreds is three presses away.
 */
export function ClickerCountDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [count, setCount] = React.useState(97);
  const wheels = values.digits ?? 4;
  const shown = String(count % 10 ** wheels).padStart(wheels, "0");

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <ClickerCount
          label="Gate B arrivals"
          value={count}
          onValueChange={setCount}
          sound={sound}
          {...values}
        />
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gate B · arrivals
        </p>
      </div>
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {shown} {count === 1 ? "arrival" : "arrivals"}
          </span>
          {count === 0 ? " · cleared" : " · hold the knob to clear"}
        </p>
      ) : null}
    </div>
  );
}
