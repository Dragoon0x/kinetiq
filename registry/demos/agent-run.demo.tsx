"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AgentRun,
  defaultRun,
  type AgentRunState,
  type AgentStep,
} from "@/registry/ui/agent-run";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 3,
    step: 0.25,
    unit: "×",
  },
  detail: {
    kind: "choice",
    label: "Detail",
    default: "standard",
    options: ["compact", "standard", "full"],
    names: { compact: "Compact", standard: "Standard", full: "Full" },
  },
  approval: {
    kind: "choice",
    label: "Approval",
    default: "hold",
    options: ["hold", "click", "auto"],
    names: { hold: "Hold", click: "Click", auto: "Auto" },
  },
});

const STEPS = defaultRun.steps;
const TOTAL_MS = STEPS.reduce((sum, s) => sum + s.ms, 0);
const TOTAL_CENTS = STEPS.reduce((sum, s) => sum + (s.cost ?? 0), 0);

const where = (step: AgentStep | null) => {
  const i = step ? STEPS.findIndex((s) => s.id === step.id) : 0;
  return `step ${i + 1} of ${STEPS.length} · ${(step ?? STEPS[0])?.title.toLowerCase() ?? ""}`;
};

/**
 * Coldbrook Bank's finance ops: the Ledger agent reconciles March payouts,
 * stops before sending money, and waits for someone to hold Approve.
 */
export function AgentRunDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [line, setLine] = React.useState<[string, string]>([
    "running",
    where(null),
  ]);

  const onStateChange = (state: AgentRunState, step: AgentStep | null) => {
    if (state === "running" || state === "paused")
      setLine([state, where(step)]);
    else if (state === "waiting")
      setLine(["waiting for approval", step?.gate?.title.toLowerCase() ?? ""]);
    else if (state === "finished")
      setLine([
        "finished",
        `${(TOTAL_MS / 1000).toFixed(1)} s · $${(TOTAL_CENTS / 100).toFixed(2)}`,
      ]);
    else if (state === "stopped") setLine(["denied", "run stopped"]);
    else setLine(["failed", where(step)]);
  };

  return (
    <div className="flex w-full max-w-6xl flex-col gap-3">
      <AgentRun
        className={chrome ? "h-[480px]" : "h-[536px]"}
        onStateChange={onStateChange}
        onDecision={(_, decision) =>
          setLine(
            decision === "approved"
              ? ["approved", "run resumed"]
              : ["denied", "run stopped"],
          )
        }
        onReplay={() => setLine(["replaying", "decisions cleared"])}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{line[0]}</span>
          {line[1] ? ` · ${line[1]}` : null}
        </p>
      ) : null}
    </div>
  );
}
