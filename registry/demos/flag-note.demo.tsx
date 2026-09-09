"use client";

import * as React from "react";

import { FlagNote, type FlagNoteValue } from "@/registry/ui/flag-note";

const ANSWER =
  "Refunds for Waylight Pay orders are paid back to the original card within ten working days of the item reaching the depot. If the card has since been closed, the refund is held as store credit instead.";

export function FlagNoteDemo() {
  const [flag, setFlag] = React.useState<FlagNoteValue | null>(null);
  const [open, setOpen] = React.useState(false);

  const status = open
    ? "Note open"
    : flag
      ? `Flagged · ${flag.reason} · ${flag.note.length} chars`
      : "Unflagged";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <FlagNote
        model="Gaugeworks Reasoner"
        answer={ANSWER}
        flag={flag}
        onFlagChange={setFlag}
        onOpenChange={setOpen}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-[var(--signal,var(--primary))]">{status}</span>
      </p>
    </div>
  );
}
