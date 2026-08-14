"use client";

import * as React from "react";

import { VolleyThread, type VolleyMessage } from "@/registry/ui/volley-thread";

/** A fixed exchange — the demo advances through it, nothing is generated. */
const SCRIPT: VolleyMessage[] = [
  { id: "m1", role: "system", content: "Session opened · bench-02" },
  {
    id: "m2",
    role: "user",
    content: "Which flavour is carrying the weekend?",
  },
  {
    id: "m3",
    role: "agent",
    content: "Pistachio, and not narrowly — it takes 23% of Saturday covers.",
    note: "4 sources · 1.2s",
  },
  {
    id: "m4",
    role: "agent",
    content: "Margin holds too: 61% against a 54% counter average.",
  },
  { id: "m5", role: "user", content: "Churn it first next week." },
  {
    id: "m6",
    role: "agent",
    content: "Scheduled for the Thursday window, ahead of the cone delivery.",
    note: "wrote ChurnSchedule.tsx",
  },
];

export function VolleyThreadDemo() {
  const [turns, setTurns] = React.useState(3);
  const done = turns >= SCRIPT.length;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <VolleyThread
        messages={SCRIPT.slice(0, turns)}
        pending={done ? undefined : "Reading the covers…"}
        aria-label="Flavour planning conversation"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTurns((n) => Math.min(n + 1, SCRIPT.length))}
          disabled={done}
          className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
        >
          Next turn
        </button>
        <button
          type="button"
          onClick={() => setTurns(3)}
          className="border-hairline text-ink-2 hover:bg-surface-2 hover:text-ink rounded-2 border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Reset demo
        </button>
      </div>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Turn{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {turns} of {SCRIPT.length}
        </span>
      </p>
    </div>
  );
}
