"use client";

import * as React from "react";

import { AgentLanes, type LaneStatus } from "@/registry/ui/agent-lanes";

/** Waylight support triage: three sub-agents on one ticket, each at its own pace. */
const AGENTS = [
  {
    id: "scout",
    agent: "Scout",
    model: "Basinworks Scout",
    task: "Search the archive",
    rate: 3.2,
    result: "4 matching threads",
  },
  {
    id: "drafter",
    agent: "Drafter",
    model: "Fernworks Model 3",
    task: "Draft the reply",
    rate: 1.6,
    result: "Reply drafted, 140 words",
  },
  {
    id: "checker",
    agent: "Checker",
    model: "Gaugeworks Reasoner",
    task: "Check policy",
    rate: 2.2,
    result: "No policy conflicts",
  },
];

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function AgentLanesDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [stoppedAt, setStoppedAt] = React.useState<Record<string, number>>({});
  const [merged, setMerged] = React.useState(0);

  // A hidden tab holds every lane where it is; nothing finishes unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Each lane's progress is a function of the tick count and its rate, so a
  // stopped lane keeps the value it had at the tick it was stopped.
  const lanes = AGENTS.map((agent) => {
    const at = stoppedAt[agent.id];
    const progress = Math.min(1, Math.round((at ?? ticks) * agent.rate) / 100);
    const status: LaneStatus = !running
      ? "queued"
      : at !== undefined
        ? "stopped"
        : progress >= 1
          ? "done"
          : "running";
    return {
      ...agent,
      progress: running ? progress : 0,
      status,
      result: status === "stopped" ? "Stopped by you" : agent.result,
    };
  });

  const live = running && lanes.some((lane) => lane.status === "running");
  React.useEffect(() => {
    if (!live || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [live, visible]);

  const reset = () => {
    setRunning(false);
    setTicks(0);
    setStoppedAt({});
    setMerged(0);
  };

  const active = lanes.filter((lane) => lane.status === "running").length;
  const stopped = lanes.filter((lane) => lane.status === "stopped").length;
  const status = !running
    ? "Idle · press run"
    : live
      ? `Running · ${active} ${active === 1 ? "lane" : "lanes"} · ${merged} merged${stopped ? ` · ${stopped} stopped` : ""}`
      : `Complete · ${merged} merged${stopped ? ` · ${stopped} stopped` : ""}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AgentLanes
        label="Ticket 4127 · triage"
        lanes={lanes}
        onStop={(id) => setStoppedAt((prev) => ({ ...prev, [id]: ticks }))}
        onMerge={() => setMerged((count) => count + 1)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning(true)}
          disabled={running}
          className={button}
        >
          Run
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!running}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
