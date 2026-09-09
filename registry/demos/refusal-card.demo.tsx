"use client";

import * as React from "react";

import { RefusalCard } from "@/registry/ui/refusal-card";

/** Gaugeworks Reasoner in Waylight's support desk, asked to read back a card number. */
const REASON = "Card numbers stay out of the transcript.";
const ALTERNATIVES = [
  { id: "reset", label: "Send a reset link" },
  { id: "last-four", label: "Show the last four" },
  { id: "ticket", label: "Open a ticket" },
];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function RefusalCardDemo() {
  const [open, setOpen] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [sent, setSent] = React.useState<string | null>(null);

  const sentLabel = ALTERNATIVES.find((item) => item.id === sent)?.label;
  const status = !open
    ? "Idle · press refuse"
    : sentLabel
      ? `Sent · ${sentLabel}`
      : `Refused · ${ALTERNATIVES.length} alternatives`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3">
        <p className="rounded-2 bg-surface-2 px-3 py-2 text-sm text-ink-2">
          Read me back the card number on the Fernworks order.
        </p>
        <RefusalCard
          key={round}
          label="Refusal from Gaugeworks Reasoner"
          open={open}
          reason={REASON}
          alternatives={ALTERNATIVES}
          onSend={setSent}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSent(null);
            setRound((value) => value + 1);
            setOpen(true);
          }}
          className={button}
        >
          {open ? "Refuse again" : "Refuse"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
