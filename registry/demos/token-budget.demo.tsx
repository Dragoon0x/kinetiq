"use client";

import * as React from "react";

import { TokenBudget } from "@/registry/ui/token-budget";

const TASKS = [
  { id: "short", name: "Short reply", estimate: 180 },
  { id: "summary", name: "Summary", estimate: 900 },
  { id: "report", name: "Full report", estimate: 2600 },
] as const;

const START = 1024;
const grouped = new Intl.NumberFormat("en-US");

const button =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function TokenBudgetDemo() {
  const [cap, setCap] = React.useState(START);
  const [settled, setSettled] = React.useState(START);
  const [task, setTask] =
    React.useState<(typeof TASKS)[number]["id"]>("summary");

  const estimate =
    TASKS.find((candidate) => candidate.id === task)?.estimate ?? 0;
  const cut = estimate > settled;
  const share = Math.min(100, Math.round((estimate / settled) * 100));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TokenBudget
        label="Fernworks Model 3 · reply length"
        value={cap}
        onValueChange={setCap}
        onSettle={setSettled}
        estimate={estimate}
      />

      <div
        role="group"
        aria-label="Waylight ticket task"
        className="flex flex-wrap items-center gap-2"
      >
        {TASKS.map((candidate) => {
          const active = candidate.id === task;
          return (
            <button
              key={candidate.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTask(candidate.id)}
              className={`${button} ${
                active
                  ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                  : "border-hairline-strong text-ink-2 hover:bg-accent"
              }`}
            >
              {candidate.name}
            </button>
          );
        })}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Cap{" "}
        <span className="text-signal tabular-nums">
          {grouped.format(settled)}
        </span>
        {" · Est "}
        <span className="tabular-nums">{grouped.format(estimate)}</span>
        {cut
          ? ` · Cut at ${grouped.format(settled)}`
          : ` · ${share}% likely used`}
      </p>
    </div>
  );
}
