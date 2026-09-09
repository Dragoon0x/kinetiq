"use client";

import * as React from "react";

import {
  RiskHold,
  type RiskHoldCause,
  type RiskHoldStatus,
} from "@/registry/ui/risk-hold";

const REVIEW_MS = 8000;

export function RiskHoldDemo() {
  const [status, setStatus] = React.useState<RiskHoldStatus>("held");
  const [cause, setCause] = React.useState<RiskHoldCause>("reviewer");

  const line =
    status === "held"
      ? `Held · review ${REVIEW_MS / 1000}s`
      : status === "released"
        ? cause === "timer"
          ? "Released on timer · sent"
          : "Released by reviewer · sent"
        : "Escalated · awaiting review";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RiskHold
        label="Waylight Pay"
        amount={1240}
        symbol="BSN"
        payee="Fernworks Ltd"
        reason="New payee"
        reviewMs={REVIEW_MS}
        status={status}
        onStatusChange={(next, why) => {
          setStatus(next);
          setCause(why);
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={status === "held"}
          onClick={() => {
            setCause("reviewer");
            setStatus("held");
          }}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Hold again
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
