"use client";

import * as React from "react";

import { GroupStack, type StackMessage } from "@/registry/ui/group-stack";

const SCRIPT: StackMessage[] = [
  { id: "g1", sender: "Marta", text: "Gate 3 is open for the morning run." },
  {
    id: "g2",
    sender: "Marta",
    text: "Two pallets for Fieldline, one for Coldbrook.",
  },
  {
    id: "g3",
    sender: "Marta",
    text: "The Coldbrook one is held until Friday.",
    time: "07:42",
  },
  { id: "g4", sender: "Rui", text: "On it. Loading the Fieldline pair first." },
  { id: "g5", sender: "Rui", text: "Scanner is back up too.", time: "07:44" },
  {
    id: "g6",
    sender: "Ines",
    text: "Thanks both. I will sign the manifest at eight.",
    time: "07:45",
  },
  {
    id: "g7",
    sender: "Marta",
    text: "One more: 4417 needs the fragile label.",
  },
  {
    id: "g8",
    sender: "Marta",
    text: "Already on the shelf by the gate.",
    time: "07:47",
  },
  { id: "g9", sender: "Rui", text: "Labelled. Rolling out.", time: "07:49" },
];
const OPENING = 2;

export function GroupStackDemo() {
  const [count, setCount] = React.useState(OPENING);
  const messages = SCRIPT.slice(0, count);
  const last = messages[messages.length - 1];

  let runs = 0;
  let runLength = 0;
  messages.forEach((message, index) => {
    if (message.sender !== messages[index - 1]?.sender) {
      runs += 1;
      runLength = 0;
    }
    runLength += 1;
  });

  const button =
    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GroupStack label="Depot channel" self="Ines" messages={messages} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={count >= SCRIPT.length}
          onClick={() => setCount((prev) => Math.min(SCRIPT.length, prev + 1))}
          className={button}
        >
          Next message
        </button>
        <button
          type="button"
          disabled={count === OPENING}
          onClick={() => setCount(OPENING)}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {count} messages · {runs} runs ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          last {last?.sender ?? "nobody"} ×{runLength}
        </span>
      </p>
    </div>
  );
}
