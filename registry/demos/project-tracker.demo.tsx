"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTrackerProjects,
  defaultTrackerTasks,
  ProjectTracker,
  type TrackerTask,
  type TrackerView,
} from "@/registry/ui/project-tracker";

export const tweaks = defineTweaks({
  view: {
    kind: "choice",
    label: "View",
    default: "list",
    options: ["list", "board", "timeline"],
    names: { list: "List", board: "Board", timeline: "Timeline" },
  },
  drawer: {
    kind: "choice",
    label: "Drawer",
    default: "overlay",
    options: ["overlay", "push", "sheet"],
    names: { overlay: "Overlay", push: "Push", sheet: "Sheet" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const day = (iso: string) => {
  const [, m = 1, d = 1] = iso.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`;
};
const STATUS: Record<TrackerTask["status"], string> = {
  todo: "to do",
  doing: "in progress",
  review: "in review",
  done: "done",
};

/**
 * Fernworks' product team on the last day of September: the Field app 3.0
 * sprint, with billing and an empty help-center project beside it.
 */
export function ProjectTrackerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tasks, setTasks] = React.useState(defaultTrackerTasks);
  const [project, setProject] = React.useState("field");
  const [openTask, setOpenTask] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  // The tweak sets where the view starts; the switch moves it from there.
  const [view, setView] = React.useState<TrackerView>(values.view ?? "list");
  const [seenView, setSeenView] = React.useState(values.view);
  if (seenView !== values.view) {
    setSeenView(values.view);
    if (values.view !== undefined) setView(values.view);
  }

  const tracker = (
    <ProjectTracker
      sound={sound}
      {...values}
      tasks={tasks}
      onTasksChange={setTasks}
      project={project}
      onProjectChange={(id) => {
        setProject(id);
        setNote(null);
      }}
      view={view}
      onViewChange={(v) => {
        setView(v);
        setNote(null);
      }}
      task={openTask}
      onTaskChange={setOpenTask}
      onTaskUpdate={(t, prev) => {
        const name = `"${t.title.toLowerCase()}"`;
        if (t.status !== prev.status)
          setNote(`moved ${name} to ${STATUS[t.status]}`);
        else if (t.start !== prev.start || t.due !== prev.due)
          setNote(`${name} now ${day(t.start)} – ${day(t.due)}`);
        else if (t.title !== prev.title) setNote(`renamed to ${name}`);
      }}
      onTaskDelete={(t) => setNote(`deleted "${t.title.toLowerCase()}"`)}
    />
  );

  if (!chrome) return <div className="w-full">{tracker}</div>;

  const current = tasks.filter((t) => t.project === project);
  const done = current.filter((t) => t.status === "done").length;
  const name =
    defaultTrackerProjects.find((p) => p.id === project)?.name.toLowerCase() ??
    project;
  const open = tasks.find((t) => t.id === openTask);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {tracker}
      <p
        role="status"
        className="truncate border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            <span className="text-signal">drawer open</span> ·{" "}
            {open.title.toLowerCase()} · escape closes
          </>
        ) : note ? (
          <>
            <span className="text-signal">{view}</span> · {note}
          </>
        ) : (
          <>
            <span className="text-signal">{name}</span> · {view} ·{" "}
            {current.length} {current.length === 1 ? "task" : "tasks"} · {done}{" "}
            done
          </>
        )}
      </p>
    </div>
  );
}
