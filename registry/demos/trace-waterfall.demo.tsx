"use client";

import * as React from "react";

import { TraceWaterfall, type TraceSpan } from "@/registry/ui/trace-waterfall";

const SPANS: TraceSpan[] = (
  [
    ["s1", "", "checkout", "gate-relay", 0, 148],
    ["s2", "s1", "auth", "gate-relay", 4, 22],
    ["s3", "s2", "token check", "ledger-api", 8, 12],
    ["s4", "s1", "capture", "ledger-api", 30, 74],
    ["s5", "s4", "reserve", "ledger-api", 34, 18],
    ["s6", "s4", "commit", "ledger-api", 56, 41, "error"],
    ["s7", "s6", "write ledger", "dock-worker", 60, 21],
    ["s8", "s6", "retry write", "dock-worker", 84, 11],
    ["s9", "s1", "receipt", "fernwork-mail", 108, 26],
    ["s10", "s9", "render", "fernwork-mail", 110, 9],
    ["s11", "s1", "respond", "gate-relay", 138, 10],
  ] as [
    id: string,
    parentId: string,
    name: string,
    service: string,
    start: number,
    duration: number,
    status?: "error",
  ][]
).map(([id, parentId, name, service, start, duration, status]) => ({
  id,
  name,
  service,
  start,
  duration,
  ...(parentId ? { parentId } : {}),
  ...(status ? { status } : {}),
}));

const BRANCHES = ["s2", "s4", "s6", "s9"];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TraceWaterfallDemo() {
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const active = SPANS.find((span) => span.id === activeId);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <TraceWaterfall
        label="Waylight Pay checkout t-9f4c"
        spans={SPANS}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        onActiveChange={setActiveId}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(BRANCHES)}
          disabled={collapsed.length === BRANCHES.length}
          className={chip}
        >
          Fold branches
        </button>
        <button
          type="button"
          onClick={() => setCollapsed([])}
          disabled={collapsed.length === 0}
          className={chip}
        >
          Expand all
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {active
            ? `${active.service} ${active.name}`
            : `${SPANS.length} spans`}
        </span>
        {active
          ? ` · ${active.duration} ms`
          : ` · 148 ms · ${collapsed.length === 0 ? "none folded" : `${collapsed.length} folded`}`}
      </p>
    </div>
  );
}
