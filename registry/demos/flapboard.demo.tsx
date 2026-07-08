"use client";

import * as React from "react";

import { Flapboard } from "@/registry/ui/flapboard";

const STATUSES = [
  "RUN 224 · PASS",
  "RUN 225 · QUEUE",
  "RUN 226 · BUILD",
  "DEPLOY · READY",
] as const;

export function FlapboardDemo() {
  const [statusIndex, setStatusIndex] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [message, setMessage] = React.useState("HELLO OPERATOR");

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setStatusIndex((index) => (index + 1) % STATUSES.length);
    }, 2800);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5">
      <div className="flex flex-col items-center gap-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
          Departures · build bay 04
        </span>
        <Flapboard value={STATUSES[statusIndex] ?? ""} padTo={16} size="md" />
      </div>

      <form
        className="flex w-full items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() !== "") setMessage(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message"
          aria-label="Message for the board"
          maxLength={16}
          className="border-input placeholder:text-muted-foreground h-8 min-w-0 flex-1 rounded-2 border bg-transparent px-2.5 font-mono text-xs"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 shrink-0 rounded-2 px-3 text-xs font-medium"
        >
          Send to board
        </button>
      </form>

      <Flapboard value={message} padTo={16} size="sm" />
    </div>
  );
}
