"use client";

import * as React from "react";

import { TaskBoard, type BoardStatus } from "@/registry/ui/task-board";

/** Six tasks on a Waylight release; each runs for its own span of ticks. */
// prettier-ignore
const TASKS = [
  { id: "changes", title: "Gather changes", agent: "Scout", span: 6 },
  { id: "tickets", title: "List tickets", agent: "Scout", span: 5 },
  { id: "draft", title: "Draft note", agent: "Drafter", span: 12 },
  { id: "links", title: "Verify links", agent: "Checker", span: 7, fails: true },
  { id: "style", title: "Spell and style", agent: "Checker", span: 6 },
  { id: "post", title: "Post note", agent: "Drafter", span: 4 },
];

/** How many cards the board runs at once. */
const LANES = 2;

type Sim = {
  tick: number;
  status: Record<string, BoardStatus>;
  started: Record<string, number>;
};

const FRESH: Sim = {
  tick: 0,
  status: Object.fromEntries(TASKS.map((task) => [task.id, "queued"])),
  started: {},
};

/** One tick: land the running cards that are due, then fill the lanes. */
const step = (sim: Sim): Sim => {
  const tick = sim.tick + 1;
  const status = { ...sim.status };
  const started = { ...sim.started };
  for (const task of TASKS) {
    if (status[task.id] !== "running") continue;
    if (tick - (started[task.id] ?? 0) >= task.span) {
      status[task.id] = task.fails ? "failed" : "done";
    }
  }
  let running = TASKS.filter((task) => status[task.id] === "running").length;
  for (const task of TASKS) {
    if (running >= LANES) break;
    if (status[task.id] !== "queued") continue;
    status[task.id] = "running";
    started[task.id] = tick;
    running += 1;
  }
  return { tick, status, started };
};

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TaskBoardDemo() {
  const [sim, setSim] = React.useState<Sim>(FRESH);
  const [playing, setPlaying] = React.useState(false);

  // A hidden tab pauses the script; the board should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const tasks = TASKS.map((task) => ({
    id: task.id,
    title: task.title,
    agent: task.agent,
    status: sim.status[task.id] ?? "queued",
  }));
  const count = (status: BoardStatus) =>
    tasks.filter((task) => task.status === status).length;
  const complete = count("queued") + count("running") === 0;
  const running = playing && !complete;

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => setSim(step), 250);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const advance = (id: string, next: "running" | "done") => {
    setSim((current) => ({
      ...current,
      status: { ...current.status, [id]: next },
      started: { ...current.started, [id]: current.tick },
    }));
  };

  const line =
    !playing && sim.tick === 0
      ? "Idle · press play"
      : complete
        ? `Complete · ${count("done")} done · ${count("failed")} failed`
        : `Running · ${count("queued")} queued · ${count("running")} running · ${count("done")} done`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <TaskBoard label="Release 2.4" tasks={tasks} onAdvance={advance} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSim(FRESH);
            setPlaying(true);
          }}
          className={`${button} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          {playing ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          disabled={!playing && tasks.every((task) => task.status === "queued")}
          onClick={() => {
            setPlaying(false);
            setSim(FRESH);
          }}
          className={`${button} border-hairline-strong text-foreground hover:bg-accent`}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
