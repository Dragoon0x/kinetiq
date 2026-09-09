"use client";

import * as React from "react";

import { ToolToggle, type ToggleTool } from "@/registry/ui/tool-toggle";

const TOOLS: ToggleTool[] = [
  { id: "search", name: "Search", hint: "Web and index", icon: "search" },
  { id: "browser", name: "Browser", hint: "Open pages", icon: "browser" },
  { id: "file", name: "File", hint: "Read and write", icon: "file" },
  { id: "shell", name: "Shell", hint: "Run commands", icon: "shell" },
  { id: "calc", name: "Calc", hint: "Exact arithmetic", icon: "calc" },
  { id: "mail", name: "Mail", hint: "Draft only", icon: "mail" },
];

const START = ["search", "browser", "file"];

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ToolToggleDemo() {
  const [enabled, setEnabled] = React.useState(START);
  const [last, setLast] = React.useState<{ id: string; on: boolean } | null>(
    null,
  );

  const on = TOOLS.filter((tool) => enabled.includes(tool.id));
  const lastTool = TOOLS.find((tool) => tool.id === last?.id);
  const roster = on.length ? on.map((tool) => tool.name).join(" · ") : "None";

  const setAll = (all: boolean) => {
    setEnabled(all ? TOOLS.map((tool) => tool.id) : []);
    setLast(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ToolToggle
        label="Gaugeworks Reasoner · tools"
        tools={TOOLS}
        enabled={enabled}
        onEnabledChange={(next, changed) => {
          setEnabled(next);
          setLast(changed);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAll(true)}
          disabled={on.length === TOOLS.length}
          className={button}
        >
          All on
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          disabled={on.length === 0}
          className={button}
        >
          All off
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lastTool && last
          ? `${lastTool.name} ${last.on ? "on" : "off"} · `
          : ""}
        <span className="text-signal tabular-nums">
          {on.length} of {TOOLS.length} on
        </span>
        {` · ${roster}`}
      </p>
    </div>
  );
}
