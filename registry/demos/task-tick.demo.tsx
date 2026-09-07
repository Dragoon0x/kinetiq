"use client";

import * as React from "react";

import { TaskTick, type TaskTickItem } from "@/registry/ui/task-tick";

const INITIAL: TaskTickItem[] = [
  { id: "survey", label: "Connect the site survey", done: true },
  { id: "team", label: "Invite two surveyors", done: true },
  { id: "canopy", label: "Set the canopy baseline", done: false },
  { id: "alerts", label: "Choose alert thresholds", done: false },
  { id: "export", label: "Schedule the weekly export", done: false },
];

export function TaskTickDemo() {
  const [tasks, setTasks] = React.useState(INITIAL);
  const done = tasks.filter((task) => task.done).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TaskTick
        label="Fernworks setup"
        items={tasks}
        onToggle={(id, next) =>
          setTasks((prev) =>
            prev.map((task) =>
              task.id === id ? { ...task, done: next } : task,
            ),
          )
        }
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Fernworks · <span className="text-signal tabular-nums">{done}</span> of{" "}
        <span className="tabular-nums">{tasks.length}</span> done
      </p>
    </div>
  );
}
