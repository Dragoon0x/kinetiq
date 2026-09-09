"use client";

import * as React from "react";

import { RunTimeline, type RunEventKind } from "@/registry/ui/run-timeline";

/** Tick it lands on, kind, agent, text. A Waylight nightly report, start to finish. */
type Step = [number, RunEventKind, string, string];

const SCRIPT: Step[] = [
  [4, "tool", "Scout", "Read reports/2026-09-08.md"],
  [9, "tool", "Scout", "Read metrics/daily.csv"],
  [14, "tool", "Scout", "Read incidents/open.json"],
  [20, "plan", "Drafter", "Outline: summary, metrics, incidents"],
  [27, "message", "Drafter", "Two incidents worth a line each."],
  [33, "tool", "Drafter", "Write report/summary.md"],
  [38, "tool", "Drafter", "Write report/metrics.md"],
  [43, "tool", "Drafter", "Write report/incidents.md"],
  [48, "tool", "Drafter", "Write report/index.md"],
  [56, "error", "Checker", "Two links in incidents.md unreachable"],
  [62, "handoff", "Checker", "Back to Drafter for the links"],
  [70, "tool", "Drafter", "Write report/incidents.md"],
  [78, "done", "Checker", "Report ready, 4 files"],
];

const END = SCRIPT[SCRIPT.length - 1]?.[0] ?? 0;

const formatAt = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function RunTimelineDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // A hidden tab holds the run where it is; nothing lands unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const complete = ticks >= END;
  const live = running && !complete;
  React.useEffect(() => {
    if (!live || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [live, visible]);

  // Every event's time is its tick, so the timeline reads the same on replay.
  const events = running
    ? SCRIPT.filter(([tick]) => ticks >= tick).map(
        ([tick, kind, agent, text], index) => ({
          id: `e${index}`,
          kind,
          agent,
          text,
          at: tick / 10,
        }),
      )
    : [];

  const reset = () => {
    setRunning(false);
    setTicks(0);
  };

  const status = !running
    ? "Idle · press run"
    : `${live ? "Live" : "Complete"} · ${events.length} events · ${formatAt(ticks / 10)}${
        collapsed ? " · grouped" : ""
      }`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RunTimeline
        label="Nightly report"
        events={events}
        live={live}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
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
