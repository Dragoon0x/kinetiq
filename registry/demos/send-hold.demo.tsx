"use client";

import * as React from "react";

import { SendHold, type SendOption } from "@/registry/ui/send-hold";

/** The message waiting to go, so the button is live from the first frame. */
const SEEDED = "Draft the release note for the sync fix";

const OPTIONS: SendOption[] = [
  { id: "now", label: "Send now", hint: "Enter", stamp: "Sent" },
  {
    id: "schedule",
    label: "Schedule",
    hint: "09:00 tomorrow",
    stamp: "Scheduled",
  },
  {
    id: "task",
    label: "Send as task",
    hint: "runs in the background",
    stamp: "Queued",
  },
];

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function SendHoldDemo() {
  const [text, setText] = React.useState(SEEDED);
  const [sent, setSent] = React.useState(0);
  const [last, setLast] = React.useState<SendOption | null>(null);

  const empty = text.trim() === "";
  const pick = (option: SendOption) => {
    setSent((n) => n + 1);
    setLast(option);
    setText("");
  };

  const count = `${sent} message${sent === 1 ? "" : "s"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center gap-2 rounded-3 border border-hairline bg-surface-1 p-1.5 pl-3 focus-within:border-hairline-strong">
        <input
          type="text"
          aria-label="Ask Gaugeworks Reasoner"
          placeholder="Ask Gaugeworks Reasoner"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter is the tap: the first option, the way the hint promises.
            const first = OPTIONS[0];
            if (event.key === "Enter" && !empty && first) {
              event.preventDefault();
              pick(first);
            }
          }}
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-ink-3"
        />
        <SendHold
          label="Send to Gaugeworks Reasoner"
          options={OPTIONS}
          disabled={empty}
          onPick={pick}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => setText(SEEDED)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last?.id === "now"
          ? `Sent now · ${count}`
          : last?.id === "schedule"
            ? `Scheduled · 09:00 tomorrow · ${count}`
            : last?.id === "task"
              ? `Queued as task · ${count}`
              : "Hold Send for options"}
      </p>
    </div>
  );
}
