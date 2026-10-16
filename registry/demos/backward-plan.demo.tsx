"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BackwardPlan,
  defaultPlanDeadline,
  defaultPlanNow,
  defaultPlanTasks,
  type PlanTask,
} from "@/registry/ui/backward-plan";

export const tweaks = defineTweaks({
  barStyle: {
    kind: "choice",
    label: "Bars",
    default: "soft",
    options: ["solid", "soft", "track"],
    names: { solid: "Solid", soft: "Soft", track: "Track" },
  },
  dayWidth: {
    kind: "range",
    label: "Day width",
    default: 12,
    min: 10,
    max: 24,
    step: 2,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "moss", "plum", "slate"],
    names: { cobalt: "Cobalt", moss: "Moss", plum: "Plum", slate: "Slate" },
  },
});

const DAY = 86_400_000;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const dayText = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

/** The same backward pass the plan makes, for the status line's words. */
function startOf(tasks: PlanTask[], deadline: number) {
  const finish = new Map<string, number>();
  const start = new Map<string, number>();
  const succ = new Map<string, PlanTask[]>();
  for (const t of tasks) succ.set(t.id, []);
  for (const t of tasks) for (const p of t.after ?? []) succ.get(p)?.push(t);
  const done = new Set<string>();
  const visit = (t: PlanTask) => {
    if (done.has(t.id)) return;
    for (const n of succ.get(t.id) ?? []) visit(n);
    done.add(t.id);
    if (t.locked && t.start !== undefined) {
      start.set(t.id, t.start);
      finish.set(t.id, t.start + t.days * DAY);
      return;
    }
    let f = deadline + DAY;
    for (const n of succ.get(t.id) ?? []) f = Math.min(f, start.get(n.id) ?? f);
    finish.set(t.id, f);
    start.set(t.id, f - t.days * DAY);
  };
  for (const t of tasks) visit(t);
  const first = Math.min(...start.values());
  const today = Math.floor(defaultPlanNow / DAY) * DAY;
  const past = [...start.values()].filter((s) => s < today).length;
  return { first, past, spare: Math.round((first - today) / DAY) };
}

/**
 * Fieldline hands the Basinworks depot over on Friday 27 November. Drag the
 * flag earlier and watch the train of tasks pull back after it; the steel
 * order is locked to its supplier slot and will not move.
 */
export function BackwardPlanDemo({
  chrome = true,
  // The planner is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tasks, setTasks] = React.useState<PlanTask[]>(defaultPlanTasks);
  const [deadline, setDeadline] = React.useState(defaultPlanDeadline);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const plan = (
    <BackwardPlan
      key={run}
      tasks={tasks}
      onTasksChange={setTasks}
      deadline={deadline}
      onDeadlineChange={(d) => {
        setDeadline(d);
        setNote(null);
      }}
      onLock={(t, locked) =>
        setNote(`${locked ? "locked" : "unlocked"} ${t.name.toLowerCase()}`)
      }
      onTaskChange={(t) =>
        setNote(
          `${t.name.toLowerCase()} · ${t.days === 1 ? "1 day" : `${t.days} days`}`,
        )
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{plan}</div>;

  const s = startOf(tasks, deadline);
  const status = `handover ${dayText(deadline)} · ${
    s.past > 0
      ? `${s.past} in the past`
      : `starts ${dayText(s.first)} · ${s.spare} ${s.spare === 1 ? "day" : "days"} spare`
  }`;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {plan}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTasks(defaultPlanTasks);
            setDeadline(defaultPlanDeadline);
            setNote(null);
            setRun((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
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
        <span className="text-signal">{note ?? status}</span>
        {note ? ` · ${status}` : null}
      </p>
    </div>
  );
}
