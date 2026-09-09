"use client";

import * as React from "react";

import { RubricGrid } from "@/registry/ui/rubric-grid";

const CRITERIA = [
  { id: "accuracy", name: "Accuracy", hint: "Facts match the account record" },
  { id: "complete", name: "Completeness", hint: "Answers the whole question" },
  { id: "tone", name: "Tone", hint: "Plain, calm, no blame" },
  { id: "brevity", name: "Brevity", hint: "Nothing the reader must skip" },
  { id: "sources", name: "Sources", hint: "Cites the policy it leans on" },
];

const LEVELS = ["Weak", "Fair", "Good", "Strong"];
const POSSIBLE = CRITERIA.length * LEVELS.length;

export function RubricGridDemo() {
  const [scores, setScores] = React.useState<Record<string, number>>({});

  const scored = CRITERIA.filter((item) => scores[item.id] !== undefined);
  const total = scored.reduce((sum, item) => sum + (scores[item.id] ?? 0), 0);

  const line =
    scored.length === 0
      ? "Unscored"
      : scored.length === CRITERIA.length
        ? "Complete"
        : `${scored.length} of ${CRITERIA.length} scored`;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <RubricGrid
        label="Gaugeworks Reasoner on a Coldbrook Bank statement query"
        criteria={CRITERIA}
        levelLabels={LEVELS}
        value={scores}
        onValueChange={setScores}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setScores({})}
          disabled={scored.length === 0}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Clear scores
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {total} / {POSSIBLE}
        </span>
      </p>
    </div>
  );
}
