"use client";

import * as React from "react";

import { PollBars, type PollOption } from "@/registry/ui/poll-bars";

/** Fixed tallies — the poll reads the same on the server and after hydration. */
const OPTIONS: PollOption[] = [
  { id: "trails", label: "Offline trail maps", votes: 412 },
  { id: "gear", label: "Gear checklists", votes: 318 },
  { id: "logs", label: "Shared trip logs", votes: 265 },
  { id: "weather", label: "Hourly weather", votes: 189 },
];

const BASE = OPTIONS.reduce((sum, option) => sum + option.votes, 0);
const count = (value: number) => value.toLocaleString("en-US");

export function PollBarsDemo() {
  const [vote, setVote] = React.useState<string | null>(null);
  const chosen = OPTIONS.find((option) => option.id === vote);
  const total = BASE + (vote ? 1 : 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PollBars
        question="Which Fernworks feature should ship first?"
        options={OPTIONS}
        value={vote}
        onVote={setVote}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {chosen ? chosen.label : "No vote yet"} · {count(total)} votes
      </p>
    </div>
  );
}
