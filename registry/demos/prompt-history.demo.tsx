"use client";

import * as React from "react";

import { PromptHistory } from "@/registry/ui/prompt-history";

/** What this desk asked Gaugeworks Reasoner last, most recent first. */
const SEEDED = [
  "Summarise the sync fix for field crews",
  "Draft a release note under 120 words",
  "List the retry backoff steps",
  "Explain the queued badge",
  "Translate the rollout plan to plain words",
];

/** The turn the reader is following up on; the stack rises over it. */
const REPLY =
  "The queued badge means a report is written and waiting for signal. It clears on its own once the crew is back in range, and the retry runs on a backoff of 2, 8 and 30 seconds so a dead spot no longer drains the battery.";

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

type Last =
  { kind: "picked"; index: number; prompt: string } | { kind: "sent" } | null;

export function PromptHistoryDemo() {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [prompts, setPrompts] = React.useState(SEEDED);
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [last, setLast] = React.useState<Last>(null);

  const count = `${prompts.length} prompt${prompts.length === 1 ? "" : "s"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="max-w-[85%] self-end rounded-3 rounded-br-1 bg-primary px-3 py-2 text-sm leading-5 text-primary-foreground">
          Explain the queued badge
        </p>
        <div className="rounded-3 rounded-bl-1 border border-hairline bg-surface-1 px-3 py-2">
          <p className="mb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Reasoner
          </p>
          <p className="text-sm leading-5 text-ink-2">{REPLY}</p>
        </div>
      </div>

      <PromptHistory
        ref={inputRef}
        label="Ask Gaugeworks Reasoner"
        prompts={prompts}
        value={text}
        onValueChange={setText}
        open={open}
        onOpenChange={setOpen}
        onPick={(prompt, index) => setLast({ kind: "picked", index, prompt })}
        onSend={(sent) => {
          setPrompts((prev) => [sent, ...prev]);
          setText("");
          setLast({ kind: "sent" });
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setText("");
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          Open history
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setText("");
            setOpen(false);
            setLast(null);
          }}
        >
          Clear
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open
          ? `History open · ${count}`
          : last?.kind === "picked"
            ? `Picked #${last.index + 1} · ${last.prompt}`
            : last?.kind === "sent"
              ? `Sent · ${count}`
              : `${count} · up for history`}
      </p>
    </div>
  );
}
