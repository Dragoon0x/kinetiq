"use client";

import * as React from "react";

import { EditBubble } from "@/registry/ui/edit-bubble";

const checkName = (next: string): string | null => {
  if (next.length < 3) return "Three characters minimum";
  if (next.length > 40) return "Forty characters at most";
  return null;
};

const checkBudget = (next: string): string | null => {
  const amount = Number(next);
  if (!next) return "Enter an amount";
  if (!Number.isFinite(amount)) return "Numbers only";
  if (amount < 500) return "Minimum is 500";
  return null;
};

export function EditBubbleDemo() {
  const [name, setName] = React.useState("Relay bench rebuild");
  const [budget, setBudget] = React.useState("4200");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-semibold">Gaugeworks</span>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Project
          </span>
        </div>

        <EditBubble
          label="Project name"
          value={name}
          onSave={setName}
          validate={checkName}
        />

        <EditBubble
          label="Monthly budget · USD"
          type="number"
          value={budget}
          onSave={setBudget}
          validate={checkBudget}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Saved <span className="text-signal">{name}</span> ·{" "}
        <span className="text-signal tabular-nums">{budget}</span>
      </p>
    </div>
  );
}
