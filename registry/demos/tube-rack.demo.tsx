"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTubeLabels,
  defaultTubeValues,
  TubeRack,
} from "@/registry/ui/tube-rack";

export const tweaks = defineTweaks({
  slosh: {
    kind: "range",
    label: "Slosh",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  gloss: {
    kind: "range",
    label: "Gloss",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "lab",
    options: ["lab", "berry", "sea", "amber"],
    names: { lab: "Lab", berry: "Berry", sea: "Sea", amber: "Amber" },
  },
});

/**
 * Basinworks soil lab: this week's nitrate reading for six plots, one tube
 * each. Set a reading by dragging its tube, or with the arrow keys.
 */
export function TubeRackDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [levels, setLevels] = React.useState(defaultTubeValues);
  const [active, setActive] = React.useState<number | null>(null);

  if (!chrome) {
    return (
      <div className="flex w-full">
        <TubeRack
          label="Nitrate by plot"
          values={levels}
          onValuesChange={setLevels}
          className="h-52 w-full"
          sound={sound}
          {...values}
        />
      </div>
    );
  }

  const mean = Math.round(
    levels.reduce((sum, v) => sum + v, 0) / Math.max(1, levels.length),
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks · soil lab
          </p>
          <p className="text-base font-medium text-foreground">
            Nitrate by plot
          </p>
        </div>
        <p className="font-mono text-[10px] text-ink-3">mg/L · week 32</p>
      </div>
      <TubeRack
        label="Nitrate by plot"
        values={levels}
        onValuesChange={setLevels}
        onActiveChange={setActive}
        className="h-56 w-full"
        sound={sound}
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {active !== null ? (
          <>
            <span className="text-signal">
              {defaultTubeLabels[active] ?? `Tube ${active + 1}`}
            </span>{" "}
            · {levels[active] ?? 0} mg/L
          </>
        ) : (
          <>
            <span className="text-signal">six plots</span> · mean {mean} mg/L
          </>
        )}
      </p>
    </div>
  );
}
