"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PourHold } from "@/registry/ui/pour-hold";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.2,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glass: {
    kind: "choice",
    label: "Glass",
    default: "tumbler",
    options: ["tumbler", "flute", "jar"],
    names: { tumbler: "Tumbler", flute: "Flute", jar: "Jar" },
  },
  overflow: { kind: "toggle", label: "Overflow", default: false },
});

/** A 500 ml glass, logged in 10 ml steps. */
const GLASS_ML = 500;
/** Already logged today, before this glass. */
const EARLIER_ML = 1000;
const GOAL_ML = 2000;

const litres = (ml: number) => `${Number((ml / 1000).toFixed(2))}`;

/**
 * Logging water in Fieldline Health: pour the glass you drank, and the
 * day's total moves with it.
 */
export function PourHoldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ml, setMl] = React.useState(0);
  const today = `${litres(EARLIER_ML + ml)} of ${litres(GOAL_ML)} l today`;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <PourHold
        label="Water"
        max={GLASS_ML}
        step={10}
        format={(v) => `${v} ml`}
        value={ml}
        onValueChange={setMl}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {ml === 0 ? (
            <>
              <span className="text-signal">glass empty</span> · hold to pour
            </>
          ) : (
            <>
              <span className="text-signal">
                {ml === GLASS_ML ? "full glass" : `poured ${ml} ml`}
              </span>{" "}
              · {today}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
