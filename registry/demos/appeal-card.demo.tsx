"use client";

import * as React from "react";

import { AppealCard, type AppealDecision } from "@/registry/ui/appeal-card";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const WORDING: Record<AppealDecision, string> = {
  pending: "under review",
  restored: "restored",
  upheld: "upheld",
};

export function AppealCardDemo() {
  const [step, setStep] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [decision, setDecision] = React.useState<AppealDecision>("pending");

  const decide = (next: AppealDecision) => {
    setStep(3);
    setDecision(next);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AppealCard
        author="Rui Santos"
        messageText="Whoever packed this Waylight Pay box clearly could not care less about it."
        room="Coldbrook"
        reason="Room rule 3"
        step={step}
        onStepChange={setStep}
        note={note}
        onNoteChange={setNote}
        decision={decision}
        decisionNote={
          decision === "restored"
            ? "Two moderators read it as a complaint, not an insult."
            : decision === "upheld"
              ? "Room rule 3 covers how a complaint is worded."
              : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStep(Math.min(3, step + 1))}
          disabled={step === 0 || step >= 3}
          className={chip}
        >
          Advance review
        </button>
        <button
          type="button"
          onClick={() => decide("restored")}
          disabled={step < 2 || decision !== "pending"}
          className={chip}
        >
          Restore
        </button>
        <button
          type="button"
          onClick={() => decide("upheld")}
          disabled={step < 2 || decision !== "pending"}
          className={chip}
        >
          Uphold
        </button>
        <button
          type="button"
          onClick={() => {
            setStep(0);
            setNote("");
            setDecision("pending");
          }}
          disabled={step === 0 && note === "" && decision === "pending"}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Rui · step {step} of 3 ·{" "}
        <span className="text-signal">
          {step === 0 ? "not sent" : WORDING[decision]}
        </span>
      </p>
    </div>
  );
}
