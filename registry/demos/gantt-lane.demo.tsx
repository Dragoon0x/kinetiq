"use client";

import * as React from "react";

import { GanttLane, type GanttTask } from "@/registry/ui/gantt-lane";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** A fixed launch window — never Date.now(), so server and client agree. */
const START = Date.UTC(2026, 3, 6);
const DAY_MS = 86_400_000;

const dayLabel = (day: number) => {
  const date = new Date(START + day * DAY_MS);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

const PLAN: GanttTask[] = [
  { id: "scope", label: "Scope lock", start: 0, end: 3 },
  { id: "build", label: "Build", start: 3, end: 9, deps: ["scope"] },
  { id: "copy", label: "Copy pass", start: 4, end: 8, deps: ["scope"] },
  { id: "review", label: "Review", start: 9, end: 12, deps: ["build", "copy"] },
  { id: "beta", label: "Beta cohort", start: 12, end: 17, deps: ["review"] },
  { id: "launch", label: "Launch", start: 17, end: 20, deps: ["beta"] },
];

export function GanttLaneDemo() {
  const [plan, setPlan] = React.useState(PLAN);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const task = plan.find((entry) => entry.id === activeId);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <GanttLane
        label="Fieldline launch"
        tasks={PLAN}
        days={21}
        today={8}
        formatDay={dayLabel}
        onChange={setPlan}
        onActiveChange={setActiveId}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {task ? (
          <>
            {task.label} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {dayLabel(task.start)} – {dayLabel(task.end)}
            </span>
          </>
        ) : (
          "Hover a bar, or drag it to a new day"
        )}
      </p>
    </div>
  );
}
