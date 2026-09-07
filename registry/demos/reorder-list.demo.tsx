"use client";

import * as React from "react";

import { ReorderList, type ReorderItem } from "@/registry/ui/reorder-list";

const STAGES: ReorderItem[] = [
  { id: "intake", label: "Intake", meta: "12 open" },
  { id: "triage", label: "Triage", meta: "5 open" },
  { id: "fit", label: "Fit check", meta: "8 open" },
  { id: "quote", label: "Quote", meta: "3 open" },
  { id: "handover", label: "Handover", meta: "1 open" },
];

export function ReorderListDemo() {
  const [order, setOrder] = React.useState(STAGES);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReorderList
        label="Waylight pipeline"
        items={STAGES}
        onReorder={setOrder}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {order.map((stage, index) => (
          <React.Fragment key={stage.id}>
            {index > 0 ? <span className="text-ink-3"> / </span> : null}
            <span
              className={
                index === 0 ? "text-[var(--signal,var(--primary))]" : undefined
              }
            >
              {stage.label}
            </span>
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}
