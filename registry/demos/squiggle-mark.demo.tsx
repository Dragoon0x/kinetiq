"use client";

import * as React from "react";

import { SquiggleMark, type SquiggleIssue } from "@/registry/ui/squiggle-mark";

const NOTE =
  "The Fieldline crew will cordinate the resurvey with Basinworks and log every reading before dusk. Wether the second sweep runs on Thursday depends on the wind.";

const ISSUES: SquiggleIssue[] = [
  { word: "cordinate", suggestion: "coordinate" },
  { word: "resurvey", suggestion: "re-survey" },
  { word: "Wether", suggestion: "Whether" },
];

export function SquiggleMarkDemo() {
  const [settled, setSettled] = React.useState<string[]>([]);
  const left = ISSUES.length - settled.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-3 border border-border bg-surface-1 p-4">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · field note
        </span>
        <SquiggleMark
          text={NOTE}
          issues={ISSUES}
          onFix={(word) =>
            setSettled((prev) => (prev.includes(word) ? prev : [...prev, word]))
          }
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{left}</span> of{" "}
        <span className="tabular-nums">{ISSUES.length}</span> still flagged
      </p>
    </div>
  );
}
