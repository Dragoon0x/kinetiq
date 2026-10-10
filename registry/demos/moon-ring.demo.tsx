"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { MoonRing, type MoonRingReason } from "@/registry/ui/moon-ring";

export const tweaks = defineTweaks({
  tilt: {
    kind: "range",
    label: "Tilt",
    default: 20,
    min: 0,
    max: 70,
    step: 5,
    unit: "°",
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 8,
    min: 0,
    max: 24,
    step: 2,
    unit: "°/s",
  },
  count: {
    kind: "range",
    label: "Count",
    default: 6,
    min: 3,
    max: 9,
    step: 1,
  },
});

const MOONS = [
  { id: "tide", label: "Tide" },
  { id: "ember", label: "Ember" },
  { id: "moss", label: "Moss" },
  { id: "frost", label: "Frost" },
  { id: "dune", label: "Dune" },
  { id: "dusk", label: "Dusk" },
  { id: "fern", label: "Fern" },
  { id: "slate", label: "Slate" },
  { id: "pearl", label: "Pearl" },
];

const HOW: Record<Exclude<MoonRingReason, "drift">, string> = {
  drag: "thrown round",
  press: "brought round",
  key: "brought round by key",
};

/**
 * The Coldbrook Observatory's moon catalogue: a lit planet and its moons on
 * a tipped orbit. Throw the ring, click a moon, or use the arrow keys.
 */
export function MoonRingDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const tilt = values.tilt ?? tweaks.tilt.default;
  const speed = values.speed ?? tweaks.speed.default;
  const count = values.count ?? tweaks.count.default;
  // Only the visitor's own moves are narrated: the drift changes the
  // caption under the ring, never the live line.
  const [moved, setMoved] = React.useState<{
    label: string;
    how: string;
  } | null>(null);

  const ring = (
    <div className="flex w-full flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook Observatory · Moons
        </p>
        <p className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          Season 04
        </p>
      </div>
      <MoonRing
        items={MOONS}
        label="Moons of Coldbrook"
        height="clamp(8.5rem, 28cqw, 11rem)"
        sound={sound}
        onValueChange={(index, reason) => {
          if (reason === "drift") return;
          setMoved({ label: MOONS[index]?.label ?? "", how: HOW[reason] });
        }}
        {...values}
      />
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{ring}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {ring}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {moved ? (
          <>
            <span className="text-signal">{moved.label}</span> {moved.how}
          </>
        ) : (
          <span className="text-signal">drag, click or use arrows</span>
        )}{" "}
        · {count} moons · tilt {tilt}° ·{" "}
        {speed === 0 ? "still" : `drifting ${speed}°/s`}
      </p>
    </div>
  );
}
