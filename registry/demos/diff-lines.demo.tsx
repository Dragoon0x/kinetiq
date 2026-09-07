"use client";

import * as React from "react";

import { DiffLines } from "@/registry/ui/diff-lines";

const BEFORE =
  "Waylight 2.4 adds an offline queue that retries failed uploads every few minutes and logs each attempt.";

const AFTER =
  "Waylight 2.4 adds an offline queue that retries failed uploads on a short backoff and records the outcome.";

export function DiffLinesDemo() {
  const [applied, setApplied] = React.useState<number[]>([]);
  const total = 2;
  const remaining = total - applied.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DiffLines
        label="Release note"
        before={BEFORE}
        after={AFTER}
        onAcceptedChange={setApplied}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {remaining === 0 ? (
          <>
            Both changes <span className="text-signal">applied</span>
          </>
        ) : (
          <>
            <span className="text-signal tabular-nums">{remaining}</span> of{" "}
            <span className="tabular-nums">{total}</span> changes to review
          </>
        )}
      </p>
    </div>
  );
}
