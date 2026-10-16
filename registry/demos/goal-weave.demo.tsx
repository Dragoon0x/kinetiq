"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultGoalWeaveTasks, GoalWeave } from "@/registry/ui/goal-weave";

export const tweaks = defineTweaks({
  cardStyle: {
    kind: "choice",
    label: "Cards",
    default: "tile",
    options: ["tile", "chip", "row"],
    names: { tile: "Tile", chip: "Chip", row: "Row" },
  },
  threadStyle: {
    kind: "choice",
    label: "Thread",
    default: "thread",
    options: ["thread", "stitch", "ribbon"],
    names: { thread: "Thread", stitch: "Stitch", ribbon: "Ribbon" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const START = ["inventory", "crews"];

/**
 * A grounds-maintenance firm setting up Fernworks: inventory and crew
 * planning are already ticked, so their tasks are woven into the first week.
 */
export function GoalWeaveDemo({
  chrome = true,
  // The weave is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [goals, setGoals] = React.useState<string[]>(START);
  const [note, setNote] = React.useState<string | null>(null);

  const step = (
    <GoalWeave
      key={round}
      value={goals}
      onGoalsChange={(ids) => {
        setGoals(ids);
        setNote(null);
      }}
      onPlanChange={() => setNote(null)}
      onAccept={(ids) => setNote(`plan accepted · ${ids.length} tasks`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{step}</div>;

  const plan = defaultGoalWeaveTasks.filter((t) =>
    t.goals.some((g) => goals.includes(g)),
  );
  const shared = plan.filter(
    (t) => t.goals.filter((g) => goals.includes(g)).length > 1,
  ).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {step}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setGoals(START);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <span className="text-signal">{note}</span>
        ) : goals.length === 0 ? (
          <>
            <span className="text-signal">starter plan</span> · 3 tasks
          </>
        ) : (
          <>
            <span className="text-signal">
              {goals.length} {goals.length === 1 ? "goal" : "goals"} ·{" "}
              {plan.length} tasks
            </span>
            {shared ? ` · ${shared} shared` : ""}
          </>
        )}
      </p>
    </div>
  );
}
