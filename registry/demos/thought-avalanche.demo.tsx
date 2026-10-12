"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  ThoughtAvalanche,
  type ThoughtAvalancheStats,
} from "@/registry/ui/thought-avalanche";

export const tweaks = defineTweaks({
  branching: {
    kind: "range",
    label: "Branching",
    default: 1.1,
    min: 0.5,
    max: 2,
    step: 0.05,
  },
  refractory: {
    kind: "range",
    label: "Rest",
    default: 1600,
    min: 200,
    max: 4000,
    step: 100,
    unit: "ms",
  },
  hue: {
    kind: "range",
    label: "Hue",
    default: 195,
    min: 0,
    max: 360,
    step: 5,
    unit: "°",
  },
});

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Gaugeworks Lab: how far does one idea go? Seed a thought in the field and
 * watch the avalanche — fizzle, cascade or storm, by the branching ratio.
 */
export function ThoughtAvalancheDemo({
  chrome = true,
  // The field is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [stats, setStats] = React.useState<ThoughtAvalancheStats | null>(null);
  const sigma = values.branching ?? tweaks.branching.default;

  if (!chrome) {
    return (
      <div className="relative flex h-[232px] w-full">
        <ThoughtAvalanche label="Thought field" {...values} />
        <p className="pointer-events-none absolute top-3 left-4 font-mono text-[10px] tracking-[0.08em] text-[oklch(0.86_0.03_250)] uppercase">
          Gaugeworks Lab · click to seed a thought
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Lab · Criticality
        </p>
        <p className="text-base font-medium text-foreground">
          How far does one idea go?
        </p>
      </div>
      <div className="h-[220px] w-full sm:h-[280px]">
        <ThoughtAvalanche
          label="Thought field"
          onAvalanche={setStats}
          {...values}
        />
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {stats === null ? (
          <>
            <span className="text-signal">click a node to seed a thought</span>{" "}
            · branching {sigma.toFixed(2)}
          </>
        ) : stats.size === 0 ? (
          <>
            <span className="text-signal">still resting</span> · try another
            node
          </>
        ) : (
          <>
            <span className="text-signal">
              {stats.phase === "faded" ? "spread and faded" : stats.phase}
            </span>{" "}
            · {count(stats.size, "thought", "thoughts")} ·{" "}
            {count(stats.generations, "step", "steps")}
          </>
        )}
      </p>
    </div>
  );
}
