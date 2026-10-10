"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TankLevel } from "@/registry/ui/tank-level";

export const tweaks = defineTweaks({
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
  waves: {
    kind: "range",
    label: "Waves",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "water",
    options: ["water", "amber", "algae", "berry"],
    names: { water: "Water", amber: "Amber", algae: "Algae", berry: "Berry" },
  },
});

const CAPACITY = 1000;
const STEP = 10;

/** Thousands with commas, by hand: the same on the server and in the browser. */
const litres = (v: number) =>
  `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} L`;

/**
 * Basinworks plant floor: the coolant tank on line B, set by dragging the
 * surface or with the arrow keys, and topped up or drained from the panel.
 */
export function TankLevelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [litresIn, setLitresIn] = React.useState(640);

  const gauge = (
    <TankLevel
      label="Coolant · Tank B"
      min={0}
      max={CAPACITY}
      step={STEP}
      format={(v) => litres(v)}
      value={litresIn}
      onValueChange={setLitresIn}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{gauge}</div>;
  }

  const button =
    "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-3">
        {gauge}
        <div className="flex gap-2">
          <button
            type="button"
            className={button}
            aria-disabled={litresIn >= CAPACITY}
            onClick={() => setLitresIn((v) => Math.min(CAPACITY, v + 250))}
          >
            Top up 250 L
          </button>
          <button
            type="button"
            className={button}
            aria-disabled={litresIn <= 0}
            onClick={() => setLitresIn((v) => Math.max(0, v - 250))}
          >
            Drain 250 L
          </button>
        </div>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          tank b · {Math.round((litresIn / CAPACITY) * 100)}%
        </span>{" "}
        · drag or use arrows
      </p>
    </div>
  );
}
