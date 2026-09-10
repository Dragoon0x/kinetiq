"use client";

import * as React from "react";

import {
  LogExpand,
  type LogEntry,
  type LogExpandView,
} from "@/registry/ui/log-expand";

const ENTRY: LogEntry = {
  time: "09:14:22",
  level: "warn",
  service: "ledger-api",
  message: "retry scheduled for capture 8841",
  fields: [
    { key: "trace", value: "t-9f4c21" },
    { key: "host", value: "dock-2.waylight" },
    { key: "route", value: "POST /captures/8841/retry" },
    { key: "status", value: "409" },
    { key: "attempt", value: "2 of 3" },
    { key: "latency_ms", value: "412" },
    { key: "region", value: "basin-north" },
    { key: "auth.token", value: "wl_7c41f0a9e2b6", secret: true },
  ],
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function LogExpandDemo() {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<LogExpandView>("fields");
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <LogExpand
        entry={ENTRY}
        open={open}
        onOpenChange={setOpen}
        view={view}
        onViewChange={setView}
        onRevealChange={setRevealed}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} className={chip}>
          {open ? "Close line" : "Open line"}
        </button>
        <button
          type="button"
          onClick={() => setView(view === "json" ? "fields" : "json")}
          className={chip}
        >
          {view === "json" ? "Show fields" : "Show JSON"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{open ? "Open" : "Closed"}</span>
        {` · ${view} · token ${revealed ? "shown" : "masked"}`}
      </p>
    </div>
  );
}
