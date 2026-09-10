"use client";

import * as React from "react";

import {
  SearchHighlight,
  type SearchLine,
} from "@/registry/ui/search-highlight";

const LINES: SearchLine[] = (
  [
    ["11:02:04", "info", "dock-worker", "batch 4471 picked up by shard 2"],
    ["11:02:06", "debug", "gate-relay", "lease renewed, ttl 30s"],
    ["11:02:09", "warn", "dock-worker", "retry 1 of 3 for batch 4471"],
    ["11:02:11", "info", "gate-relay", "handshake accepted from dock-2"],
    ["11:02:13", "debug", "dock-worker", "shard 2 backlog 18 items"],
    ["11:02:15", "warn", "dock-worker", "retry 2 of 3 for batch 4471"],
    ["11:02:18", "error", "dock-worker", "batch 4471 dropped after 3 retries"],
    ["11:02:20", "info", "gate-relay", "north run clear"],
    ["11:02:22", "debug", "gate-relay", "peer dock-2 answered in 12ms"],
    ["11:02:24", "info", "dock-worker", "batch 4482 picked up by shard 1"],
    ["11:02:27", "debug", "dock-worker", "shard 1 backlog 4 items"],
    ["11:02:29", "warn", "gate-relay", "queue depth 212, above the mark"],
    ["11:02:31", "info", "dock-worker", "batch 4482 drained in 412ms"],
    ["11:02:34", "debug", "gate-relay", "backoff window 400ms"],
    ["11:02:36", "error", "gate-relay", "handshake refused by dock-2"],
    ["11:02:39", "info", "gate-relay", "retry window opens in 2s"],
  ] as [
    time: string,
    level: SearchLine["level"],
    service: string,
    text: string,
  ][]
).map(([time, level, service, text], at) => ({
  id: `line-${at}`,
  time,
  level,
  service,
  text,
}));

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SearchHighlightDemo() {
  const [query, setQuery] = React.useState("retry");
  const [regex, setRegex] = React.useState(false);
  const [matches, setMatches] = React.useState(0);
  const [index, setIndex] = React.useState(0);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <SearchHighlight
        label="Search gate log"
        lines={LINES}
        query={query}
        onQueryChange={setQuery}
        regex={regex}
        onRegexChange={setRegex}
        onMatchesChange={setMatches}
        onIndexChange={setIndex}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRegex(false);
            setQuery("retry");
          }}
          className={chip}
        >
          Find retry
        </button>
        <button
          type="button"
          onClick={() => {
            setRegex(true);
            setQuery("\\b4\\d{3}\\b");
          }}
          className={chip}
        >
          Find codes
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {matches === 0
            ? "No matches"
            : `${matches} ${matches === 1 ? "match" : "matches"}`}
        </span>
        {matches === 0 ? "" : ` · at ${index + 1}`}
        {` · ${regex ? "regex" : "plain"}`}
      </p>
    </div>
  );
}
