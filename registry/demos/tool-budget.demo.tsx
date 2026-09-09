"use client";

import * as React from "react";

import { ToolBudget } from "@/registry/ui/tool-budget";

const BUDGET = 10;
const TOOLS = [
  { id: "shell", name: "Shell" },
  { id: "file", name: "File" },
  { id: "browser", name: "Browser" },
  { id: "search", name: "Search" },
] as const;

type ToolId = (typeof TOOLS)[number]["id"];

/** The order Fernworks Model 3 reaches for its tools on a Basinworks task. */
const SCRIPT: ToolId[] = [
  "search",
  "browser",
  "file",
  "shell",
  "file",
  "shell",
  "browser",
  "file",
  "shell",
  "shell",
];
const TICK_MS = 650;

const EMPTY: Record<ToolId, number> = {
  shell: 0,
  file: 0,
  browser: 0,
  search: 0,
};

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ToolBudgetDemo() {
  const [calls, setCalls] = React.useState(EMPTY);
  const [running, setRunning] = React.useState(false);

  const used = Object.values(calls).reduce((sum, count) => sum + count, 0);
  const remaining = Math.max(0, BUDGET - used);

  // A hidden tab holds the run where it is rather than spending unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The run is live only while there is something left to spend.
  const live = running && remaining > 0;

  React.useEffect(() => {
    if (!live || !visible) return;
    const timer = window.setTimeout(() => {
      const tool = SCRIPT[used % SCRIPT.length] ?? "shell";
      setCalls((current) => ({ ...current, [tool]: current[tool] + 1 }));
    }, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [live, visible, used]);

  const spend = (id: string) => {
    if (remaining === 0) return;
    const tool = TOOLS.find((candidate) => candidate.id === id);
    if (!tool) return;
    setCalls((current) => ({ ...current, [tool.id]: current[tool.id] + 1 }));
  };

  const reset = () => {
    setRunning(false);
    setCalls(EMPTY);
  };

  const tally = TOOLS.filter((tool) => calls[tool.id] > 0)
    .map((tool) => `${tool.id} ${calls[tool.id]}`)
    .join(" · ");
  const status =
    remaining === 0
      ? "Locked · budget spent"
      : `${remaining <= 3 ? "Low · " : ""}${remaining} of ${BUDGET} left`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ToolBudget
        label="Fernworks Model 3 · tool calls"
        budget={BUDGET}
        used={used}
        tools={TOOLS.map((tool) => ({ ...tool, calls: calls[tool.id] }))}
        onCall={spend}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRunning(true)}
          disabled={live || remaining === 0}
          className={button}
        >
          Run agent
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={used === 0}
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
        {live ? " · running" : ""}
        {tally ? ` · ${tally}` : ""}
      </p>
    </div>
  );
}
