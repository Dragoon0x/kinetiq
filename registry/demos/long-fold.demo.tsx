"use client";

import * as React from "react";

import { LongFold, type FoldMessage } from "@/registry/ui/long-fold";

/** Marta's handover note, the one message that folds. */
const NOTE = [
  "Handover for the night shift.",
  "",
  "Batch 4471 cleared at 08:58 after the signer clock drift. Both signers are on the rack A sync unit now and the rack B unit is tagged for replacement; do not move them back.",
  "",
  "Two smaller batches went out on their own. Coldbrook Bank confirmed receipt of all three at 09:15 and the confirmation ids are in the incident doc.",
  "",
  "Open items: the drift alarm is set at five seconds but has not fired in anger yet, so the first real alert pages whoever is on. The refund queue is running an hour behind because it waited on 4471; it should catch up by midnight without help.",
  "",
  "If Basinworks calls about the short pallet, that is dispatch, not us, and Ines has already rung them.",
  "",
  "Anything else, ring me before eleven.",
].join("\n");

const MESSAGES: FoldMessage[] = [
  {
    id: "m1",
    author: "Ines",
    at: "16:58",
    text: "Before you go, where are we with payouts?",
    mine: true,
  },
  { id: "m2", author: "Marta", at: "17:02", text: NOTE },
  {
    id: "m3",
    author: "Ines",
    at: "17:05",
    text: "Got it. I'll watch the refund queue.",
    mine: true,
  },
  { id: "m4", author: "Marta", at: "17:06", text: "Thanks. Off now." },
];

const LINES = 4;

export function LongFoldDemo() {
  const [open, setOpen] = React.useState<string[]>([]);
  const [folds, setFolds] = React.useState(0);

  const note = MESSAGES[1];
  const isOpen = note !== undefined && open.includes(note.id);
  const who = note ? `${note.author} ${note.at}` : "";
  const line = isOpen
    ? ["Unfolded ·", who, ""]
    : folds > 0
      ? ["Folded ·", who, "· top in view"]
      : ["Folded ·", who, `· ${LINES} lines`];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LongFold
        label="Payouts handover"
        messages={MESSAGES}
        lines={LINES}
        open={open}
        onOpenChange={(id, next) => {
          setOpen((prev) =>
            next ? [...prev, id] : prev.filter((item) => item !== id),
          );
          if (!next) setFolds((count) => count + 1);
        }}
      />

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
