"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CurveSlider } from "@/registry/ui/curve-slider";

export const tweaks = defineTweaks({
  path: {
    kind: "choice",
    label: "Path",
    default: "arc",
    options: ["arc", "wave", "spiral"],
    names: { arc: "Arc", wave: "Wave", spiral: "Spiral" },
  },
  marks: {
    kind: "range",
    label: "Marks",
    default: 6,
    min: 0,
    max: 12,
    step: 1,
  },
  fill: { kind: "toggle", label: "Fill", default: true },
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 6,
    min: 2,
    max: 14,
    step: 2,
    unit: "px",
  },
});

const minutes = (v: number) => (v === 0 ? "Off" : `${v} min`);
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Zone 2 waters at six every morning. */
const START = 6 * 60;

/**
 * Basinworks irrigation, zone 2 (the vegetable beds): how long the drip line
 * runs each morning, 0 to 60 minutes along whichever line the path draws.
 */
export function CurveSliderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(20);

  return (
    <div className="flex w-full max-w-72 flex-col items-center gap-4">
      <CurveSlider
        label="Zone 2 run time"
        min={0}
        max={60}
        value={run}
        onValueChange={setRun}
        format={minutes}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">zone 2</span>
          {run === 0 ? " · off" : ` · ${clock(START)} to ${clock(START + run)}`}
        </p>
      ) : null}
    </div>
  );
}
