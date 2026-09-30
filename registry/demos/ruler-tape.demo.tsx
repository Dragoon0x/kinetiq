"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RulerTape, type RulerTapeUnit } from "@/registry/ui/ruler-tape";

export const tweaks = defineTweaks({
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spacing: {
    kind: "range",
    label: "Spacing",
    default: 10,
    min: 6,
    max: 16,
    step: 2,
    unit: "px",
  },
  majorEvery: {
    kind: "range",
    label: "Major every",
    default: 10,
    min: 2,
    max: 10,
    step: 1,
  },
  unit: {
    kind: "choice",
    label: "Unit",
    default: "cm",
    options: ["cm", "in"],
    names: { cm: "Centimetres", in: "Inches" },
  },
});

/** The desk top comes 80 to 200 cm wide; the inch scale covers the same span. */
const RANGE: Record<RulerTapeUnit, { min: number; max: number; step: number }> =
  {
    cm: { min: 80, max: 200, step: 1 },
    in: { min: 31.5, max: 78.7, step: 0.1 },
  };

type Width = { value: number; unit: RulerTapeUnit };

/** The width in `unit`, converted only for display, so flipping never drifts. */
const shownIn = (w: Width, unit: RulerTapeUnit) => {
  if (w.unit === unit) return w.value;
  return unit === "in"
    ? Math.round((w.value / 2.54) * 10) / 10
    : Math.round(w.value * 2.54);
};

/**
 * A Fernworks made-to-measure desk: throw the tape to the width of the top.
 * The width is kept in the unit it was last set in, so switching between
 * centimetres and inches and back lands on the same number.
 */
export function RulerTapeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const unit: RulerTapeUnit = values.unit ?? "cm";
  const [width, setWidth] = React.useState<Width>({ value: 140, unit: "cm" });
  const shown = shownIn(width, unit);
  const cm = width.unit === "cm" ? width.value : width.value * 2.54;
  const fits =
    cm >= 160 ? "three monitors" : cm >= 110 ? "two monitors" : "one monitor";

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <RulerTape
        label="Desk top width"
        {...RANGE[unit]}
        value={shown}
        onValueChange={(v) => setWidth({ value: v, unit })}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {shown} {unit} wide
          </span>
          {` · fits ${fits}`}
        </p>
      ) : null}
    </div>
  );
}
