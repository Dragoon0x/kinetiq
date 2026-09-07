"use client";

import * as React from "react";

import { ActivityRings, type ActivityRing } from "@/registry/ui/activity-rings";

/** Fixed chart art — three hues that hold their identity on both themes. */
const RINGS = [
  {
    id: "move",
    label: "Move",
    goal: 520,
    color: "oklch(0.7 0.19 22)",
    add: 60,
    unit: "kcal",
  },
  {
    id: "exercise",
    label: "Exercise",
    goal: 30,
    color: "oklch(0.76 0.17 150)",
    add: 5,
    unit: "min",
  },
  {
    id: "stand",
    label: "Stand",
    goal: 12,
    color: "oklch(0.74 0.14 220)",
    add: 1,
    unit: "hr",
  },
];

/** Move opens just short of its goal, so one press takes it past the ring. */
const START = [480, 22, 8];

export function ActivityRingsDemo() {
  const [values, setValues] = React.useState(START);

  const rings: ActivityRing[] = RINGS.map((ring, index) => ({
    id: ring.id,
    label: ring.label,
    value: values[index] ?? 0,
    goal: ring.goal,
    color: ring.color,
  }));

  const reading = rings
    .map(
      (ring) => `${ring.label} ${Math.round((ring.value / ring.goal) * 100)}%`,
    )
    .join(" · ");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Coldbrook · today
        </span>
        <button
          type="button"
          onClick={() => setValues(START)}
          className="cursor-pointer font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Reset
        </button>
      </div>

      <ActivityRings rings={rings} aria-label="Coldbrook daily activity" />

      <div className="flex flex-wrap gap-2">
        {RINGS.map((ring, index) => (
          <button
            key={ring.id}
            type="button"
            onClick={() =>
              setValues((current) =>
                current.map((value, at) =>
                  at === index ? value + ring.add : value,
                ),
              )
            }
            className="flex h-9 flex-1 basis-0 cursor-pointer items-center justify-center rounded-2 border border-hairline bg-surface-2 px-2 text-xs font-medium text-foreground outline-none hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            +{ring.add} {ring.unit}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading}
      </p>
    </div>
  );
}
