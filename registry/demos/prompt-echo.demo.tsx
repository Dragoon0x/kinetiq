"use client";

import * as React from "react";

import { PromptEcho } from "@/registry/ui/prompt-echo";

/** Gaugeworks Reasoner restating a Fieldline dispatch request. */
const REQUEST =
  "Pull last week's late deliveries for the north depot and make me a table.";

const PARTS = [
  { id: "lead", text: "Find the deliveries that ran late " },
  {
    id: "when",
    text: "last week",
    options: ["this week", "in the last 30 days"],
  },
  { id: "mid", text: " for " },
  {
    id: "where",
    text: "the north depot",
    options: ["all depots", "the south depot"],
  },
  { id: "tail", text: ", then lay them out as " },
  { id: "shape", text: "a table", options: ["a chart", "a short summary"] },
  { id: "end", text: "." },
];

const TOTAL = PARTS.reduce((sum, part) => sum + part.text.length, 0);
const ASSUMPTIONS = PARTS.filter((part) => part.options).length;

/** A seeded jitter so the letters land like typing, not a metronome. */
const DELAYS = [34, 22, 48, 28, 40, 26, 58, 30];

export function PromptEchoDemo() {
  const [typed, setTyped] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = React.useState<number | null>(null);

  // A hidden tab pauses the typing; the restatement should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const typing = playing && typed < TOTAL;
  React.useEffect(() => {
    if (!typing || !visible) return;
    const timer = window.setTimeout(
      () => setTyped((count) => count + 1),
      DELAYS[typed % DELAYS.length],
    );
    return () => window.clearTimeout(timer);
  }, [typing, visible, typed]);

  const echo = () => {
    setTyped(0);
    setEdits({});
    setConfirmed(null);
    setPlaying(true);
  };

  const editCount = Object.keys(edits).length;
  const line =
    confirmed !== null
      ? [
          "Confirmed ·",
          `${confirmed} ${confirmed === 1 ? "edit" : "edits"}`,
          "",
        ]
      : typing
        ? ["Typing ·", `${typed} of ${TOTAL}`, ""]
        : typed >= TOTAL
          ? editCount > 0
            ? ["Edited ·", `${editCount} of ${ASSUMPTIONS}`, "assumptions"]
            : ["Heard ·", "0 edits", `· ${ASSUMPTIONS} assumptions`]
          : ["Press echo", "", ""];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PromptEcho
        label="Dispatch request"
        model="Gaugeworks Reasoner"
        request={REQUEST}
        parts={PARTS}
        typed={typed}
        edits={edits}
        onEditsChange={setEdits}
        onConfirm={(_, count) => setConfirmed(count)}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={echo}
          disabled={typing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {playing ? "Echo again" : "Echo"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
