"use client";

import * as React from "react";

import {
  LevelFilter,
  type FilterLevel,
  type LevelLine,
} from "@/registry/ui/level-filter";

const LINES: LevelLine[] = (
  [
    ["09:14:02", "debug", "ledger-api", "pool 2 of 8 connections busy"],
    ["09:14:04", "info", "ledger-api", "capture 8841 accepted"],
    ["09:14:05", "debug", "gate-relay", "lease renewed, ttl 30s"],
    ["09:14:07", "debug", "gate-relay", "peer dock-2 answered in 12ms"],
    ["09:14:09", "warn", "ledger-api", "retry 1 of 3 for capture 8843"],
    ["09:14:11", "info", "gate-relay", "handshake accepted from dock-2"],
    ["09:14:12", "debug", "ledger-api", "batch 77 queued"],
    ["09:14:14", "error", "ledger-api", "capture 8843 refused, ledger locked"],
    ["09:14:15", "debug", "gate-relay", "backoff window 400ms"],
    ["09:14:17", "info", "dock-worker", "batch 77 drained in 412ms"],
    ["09:14:18", "debug", "dock-worker", "shard 3 idle"],
    ["09:14:20", "warn", "dock-worker", "queue depth 212, above the mark"],
    ["09:14:22", "debug", "gate-relay", "lease renewed, ttl 30s"],
    ["09:14:24", "error", "gate-relay", "handshake refused by dock-2"],
    ["09:14:25", "info", "ledger-api", "capture 8844 accepted"],
    ["09:14:27", "debug", "ledger-api", "pool 5 of 8 connections busy"],
    ["09:14:29", "error", "dock-worker", "batch 78 dropped after 3 retries"],
    ["09:14:31", "info", "gate-relay", "north run clear"],
  ] as [time: string, level: FilterLevel, service: string, text: string][]
).map(([time, level, service, text], at) => ({
  id: `line-${at}`,
  time,
  level,
  service,
  text,
}));

const ALL: FilterLevel[] = ["debug", "info", "warn", "error"];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function LevelFilterDemo() {
  const [levels, setLevels] = React.useState<FilterLevel[]>(ALL);

  const shownCount = LINES.filter((line) => levels.includes(line.level)).length;
  const heading =
    levels.length === ALL.length
      ? "All levels"
      : levels.length === 0
        ? "No levels"
        : levels.join(", ");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LevelFilter
        label="basinworks"
        lines={LINES}
        levels={levels}
        onLevelsChange={setLevels}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLevels(["error"])}
          disabled={levels.length === 1 && levels[0] === "error"}
          className={chip}
        >
          Errors only
        </button>
        <button
          type="button"
          onClick={() => setLevels(ALL)}
          disabled={levels.length === ALL.length}
          className={chip}
        >
          Show all
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{heading}</span>
        {` · ${shownCount} of ${LINES.length} lines`}
      </p>
    </div>
  );
}
