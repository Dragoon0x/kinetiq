"use client";

import * as React from "react";

import { PolicyNote, type PolicyNoteReason } from "@/registry/ui/policy-note";

/** Fernworks Model 3 in Coldbrook's staff desk, asked to approve Friday's overtime. */
const ANSWER =
  "I can draft the overtime request for Friday and send it to your manager, but I can't approve it myself.";
const CODE = "Coldbrook house policy 4.2";
const TITLE = "Approvals stay with people";
const NOTE =
  "The assistant drafts requests and never signs off on pay, leave or overtime. A named manager approves each one, and the draft says who that is.";

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function PolicyNoteDemo() {
  const [round, setRound] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [by, setBy] = React.useState<PolicyNoteReason | null>(null);

  const status = open
    ? "Unfolded · policy 4.2 · reading"
    : by === "read"
      ? "Folded after reading · policy 4.2"
      : by
        ? `Folded by ${by} · policy 4.2`
        : "Folded · press why this answer";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PolicyNote
        key={round}
        label="Fernworks Model 3"
        model="Fernworks Model 3"
        answer={ANSWER}
        code={CODE}
        title={TITLE}
        note={NOTE}
        onOpenChange={(next, reason) => {
          setOpen(next);
          setBy(reason);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setBy(null);
            setRound((value) => value + 1);
          }}
          className={button}
        >
          Reset
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
