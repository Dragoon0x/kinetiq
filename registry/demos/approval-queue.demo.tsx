"use client";

import * as React from "react";

import {
  ApprovalQueue,
  type ApprovalDecision,
  type ApprovalItem,
} from "@/registry/ui/approval-queue";

/** Fernworks Model 3 asking before it acts on a Basinworks repo. */
const ACTIONS: ApprovalItem[] = [
  {
    id: "sync",
    tool: "shell",
    summary: "Run basin sync --ledger ledger.csv",
    detail: "Posts 42 entries to basinworks.example.",
    risk: "medium",
  },
  {
    id: "rates",
    tool: "file",
    summary: "Write src/ledger/rates.ts",
    detail: "New file, 16 lines.",
    risk: "low",
  },
  {
    id: "open",
    tool: "browser",
    summary: "Open basinworks.example/rates",
    detail: "Read only.",
    risk: "low",
  },
  {
    id: "clean",
    tool: "shell",
    summary: "Remove the build/ cache",
    detail: "Deletes 212 files; they rebuild on the next run.",
    risk: "high",
  },
];

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ApprovalQueueDemo() {
  const [items, setItems] = React.useState(ACTIONS);
  const [approved, setApproved] = React.useState(0);
  const [denied, setDenied] = React.useState(0);
  const [last, setLast] = React.useState<{
    decision: ApprovalDecision;
    summary: string;
  } | null>(null);

  const decide = (id: string, decision: ApprovalDecision) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    setItems((current) => current.filter((entry) => entry.id !== id));
    if (decision === "approve") setApproved((count) => count + 1);
    else setDenied((count) => count + 1);
    setLast({ decision, summary: item.summary });
  };

  const approveAll = () => {
    setApproved((count) => count + items.length);
    setLast({ decision: "approve", summary: `all ${items.length}` });
    setItems([]);
  };

  const reset = () => {
    setItems(ACTIONS);
    setApproved(0);
    setDenied(0);
    setLast(null);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ApprovalQueue
        label="Fernworks Model 3 wants to"
        items={items}
        onDecide={decide}
        onApproveAll={approveAll}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          disabled={items.length === ACTIONS.length}
          className={button}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {items.length === 0 ? "Queue clear" : `Waiting ${items.length}`} ·
        approved <span className="text-signal tabular-nums">{approved}</span> ·
        denied <span className="tabular-nums">{denied}</span>
        {last
          ? ` · last ${last.decision === "approve" ? "approved" : "denied"} ${last.summary}`
          : ""}
      </p>
    </div>
  );
}
