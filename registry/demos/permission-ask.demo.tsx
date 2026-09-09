"use client";

import * as React from "react";

import {
  PermissionAsk,
  type PermissionDecision,
} from "@/registry/ui/permission-ask";

/** Gaugeworks Reasoner in Fieldline's ops console, about to write a rota. */
const TOOL = "write_file";
const TARGET = "ops/rota-2026-w37.csv";
const REASON = "Overwrites a rota outside the draft folder.";
const ARM_DELAY = 700;

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function PermissionAskDemo() {
  const [open, setOpen] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [decision, setDecision] = React.useState<
    PermissionDecision | undefined
  >(undefined);

  const decide = (next: PermissionDecision) => {
    setOpen(false);
    setDecision(next);
  };

  const status = open
    ? armed
      ? "Asking · allow armed"
      : `Asking · allow arms in ${(ARM_DELAY / 1000).toFixed(1)}s`
    : decision === "allowed"
      ? `Allowed · ${TOOL} runs`
      : decision === "denied"
        ? `Denied · ${TOOL} skipped`
        : "Idle · press ask";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PermissionAsk
        label="Permission for write_file"
        open={open}
        tool={TOOL}
        target={TARGET}
        reason={REASON}
        risk="high"
        armDelay={ARM_DELAY}
        decision={decision}
        onArmed={() => setArmed(true)}
        onAllow={() => decide("allowed")}
        onDeny={() => decide("denied")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={open}
          onClick={() => {
            setDecision(undefined);
            setArmed(false);
            setOpen(true);
          }}
          className={button}
        >
          {decision ? "Ask again" : "Ask"}
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
