"use client";

import * as React from "react";

import { TaskCardChat } from "@/registry/ui/task-card-chat";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TaskCardChatDemo() {
  const [done, setDone] = React.useState(false);
  const [late, setLate] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TaskCardChat
        label="Coldbrook depot thread"
        peerName="Marta"
        doneAt="14:12"
        overdue={late}
        task={{
          id: "task-1",
          from: "peer",
          title: "Bring the bay-four gauges in before the Friday run",
          assignee: { id: "rui", name: "Rui Baptista" },
          due: "Friday, before the run",
          time: "14:06",
        }}
        checked={done}
        onCheckedChange={setDone}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={done}
          onClick={() => setLate((prev) => !prev)}
        >
          {late ? "Back in time" : "Let it run late"}
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => {
            setDone(false);
            setLate(false);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-[var(--signal,var(--primary))]">
          {done ? "done" : "open"}
        </span>{" "}
        · Rui ·{" "}
        {done ? "14:12" : late ? "overdue" : "due Friday, before the run"}
      </p>
    </div>
  );
}
