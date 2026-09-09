"use client";

import * as React from "react";

import { RiskMeter } from "@/registry/ui/risk-meter";

type Proposal = { action: string; risk: number };

/** Gaugeworks Reasoner in Fieldline's ops console, proposing four actions in turn. */
const PROPOSALS: Proposal[] = [
  { action: "Reply to the customer", risk: 0.12 },
  { action: "Refund 40.00 to the card on file", risk: 0.48 },
  { action: "Delete 14 draft invoices", risk: 0.86 },
  { action: "Email all 2,300 subscribers", risk: 0.93 },
];
const FIRST: Proposal = { action: "Reply to the customer", risk: 0.12 };

const bandOf = (risk: number): string =>
  risk < 0.35 ? "low" : risk < 0.7 ? "moderate" : "high";

const quiet =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function RiskMeterDemo() {
  const [index, setIndex] = React.useState(0);
  const [armed, setArmed] = React.useState(false);
  const [ran, setRan] = React.useState<string | null>(null);

  const current = PROPOSALS[index] ?? FIRST;

  const status = ran
    ? `Ran · ${ran}`
    : `Risk ${current.risk.toFixed(2)} · ${bandOf(current.risk)}${armed ? " · confirm armed" : ""}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RiskMeter
        label="Proposed action and its risk"
        action={current.action}
        risk={current.risk}
        onArmChange={setArmed}
        onRun={() => setRan(current.action)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setRan(null);
            setIndex((step) => (step + 1) % PROPOSALS.length);
          }}
          className={quiet}
        >
          Next action
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
