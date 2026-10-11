"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultYearRingsItems, YearRings } from "@/registry/ui/year-rings";

export const tweaks = defineTweaks({
  ringGap: {
    kind: "range",
    label: "Ring gap",
    default: 1.4,
    min: 1.1,
    max: 2,
    step: 0.05,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0,
    max: 2,
    step: 0.1,
  },
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Fieldline Studio's field notes: six years of photographs from the same
 * walks, filed by year in the rings of one slice of timber.
 */
export function YearRingsDemo({
  chrome = true,
  // The archive is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [held, setHeld] = React.useState<number | null>(null);
  const items = defaultYearRingsItems;

  const archive = (
    <YearRings
      value={held}
      onValueChange={setHeld}
      label="Fieldline Studio field notes"
      className="h-full"
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full" style={{ height: 548 }}>
        {archive}
      </div>
    );
  }

  const it = held === null ? null : items[held];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline Studio
        </p>
        <p className="text-sm font-medium text-foreground">
          Six years of field notes
        </p>
      </div>
      <div className="w-full" style={{ height: 440 }}>
        {archive}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {it ? (
          <>
            <span className="text-signal">forward</span> · {it.year} ·{" "}
            {(it.caption ?? it.alt).toLowerCase()}
          </>
        ) : (
          <>
            <span className="text-signal">{items.length} pictures</span> · 2020
            to 2025 · oldest at the core
          </>
        )}
      </p>
    </div>
  );
}
