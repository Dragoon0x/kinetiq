"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AgentInbox,
  defaultInboxTasks,
  type InboxTask,
} from "@/registry/ui/agent-inbox";

export const tweaks = defineTweaks({
  swipe: {
    kind: "choice",
    label: "Swipe",
    default: "both",
    options: ["both", "approve", "off"],
    names: { both: "Both ways", approve: "Approve", off: "Off" },
  },
  batch: { kind: "toggle", label: "Batch", default: true },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Fieldline's review queue: six changes its agents finished overnight,
 * waiting on an engineer to approve or send back.
 */
export function AgentInboxDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tasks, setTasks] = React.useState<InboxTask[]>(defaultInboxTasks);
  const [note, setNote] = React.useState<string | null>(null);

  const waiting = tasks.filter((t) => (t.status ?? "pending") === "pending");
  const approved = tasks.filter((t) => t.status === "approved").length;
  const returned = tasks.filter((t) => t.status === "returned").length;
  const line =
    waiting.length === 0
      ? `inbox zero · ${approved} approved, ${returned} sent back`
      : (note ?? `${waiting.length} waiting · ${approved + returned} reviewed`);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-3">
      <AgentInbox
        className={chrome ? "h-[500px]" : "h-[560px]"}
        tasks={tasks}
        onTasksChange={setTasks}
        onApprove={(list) =>
          setNote(
            `approved · ${list.length === 1 ? (list[0]?.title.toLowerCase() ?? "") : `${list.length} changes`}`,
          )
        }
        onReturn={(list, text) => setNote(`sent back · ${text.toLowerCase()}`)}
        onUndo={(task) => setNote(`undone · ${task.title.toLowerCase()}`)}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{line.split(" · ")[0]}</span>
            {line.includes(" · ")
              ? ` · ${line.split(" · ").slice(1).join(" · ")}`
              : null}
          </p>
          <button
            type="button"
            onClick={() => {
              setNote(null);
              setTasks(defaultInboxTasks);
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Refill
          </button>
        </div>
      ) : null}
    </div>
  );
}
