"use client";

import * as React from "react";

import { DeleteFade, type DeleteMessage } from "@/registry/ui/delete-fade";

const SEEDED: DeleteMessage[] = [
  {
    id: "d1",
    from: "Marta",
    text: "Refund for order 4471 went out at 09:12.",
    time: "09:14",
  },
  {
    id: "d2",
    from: "me",
    text: "Thanks. Did the customer get the note?",
    time: "09:15",
  },
  {
    id: "d3",
    from: "Rui",
    text: "Sent from the Waylight Pay dashboard, copy in the thread.",
    time: "09:16",
  },
  {
    id: "d4",
    from: "Marta",
    text: "Ignore my earlier number, it was 4417.",
    time: "09:17",
  },
];

/** Each reset re-keys the seeded thread so old pending marks cannot linger. */
const seed = (generation: number) =>
  SEEDED.map((message) => ({ ...message, id: `${message.id}-${generation}` }));

export function DeleteFadeDemo() {
  const [generation, setGeneration] = React.useState(0);
  const [messages, setMessages] = React.useState(() => seed(0));
  const [pending, setPending] = React.useState(0);
  const [removed, setRemoved] = React.useState(0);

  const reset = () => {
    const next = generation + 1;
    setGeneration(next);
    setMessages(seed(next));
    setPending(0);
    setRemoved(0);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DeleteFade
        label="Support thread"
        messages={messages}
        undoWindow={4000}
        onDelete={() => setPending((prev) => prev + 1)}
        onUndo={() => setPending((prev) => Math.max(0, prev - 1))}
        onExpire={(id) => {
          setMessages((prev) => prev.filter((message) => message.id !== id));
          setPending((prev) => Math.max(0, prev - 1));
          setRemoved((prev) => prev + 1);
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={messages.length === SEEDED.length && pending === 0}
          onClick={reset}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Reset thread
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {messages.length} messages ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {pending} pending
        </span>{" "}
        · {removed} removed
      </p>
    </div>
  );
}
