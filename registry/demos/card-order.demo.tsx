"use client";

import * as React from "react";

import { CardOrder, type OrderStage } from "@/registry/ui/card-order";

const STAGES: OrderStage[] = [
  { id: "printed", label: "Printed", note: "Fernworks press" },
  { id: "posted", label: "Posted", note: "Coldbrook depot" },
  { id: "out", label: "Out for delivery", note: "On the van" },
  { id: "delivered", label: "Delivered", note: "At your door" },
];

type Estimate = { days: number; date: string };

/** Seeded estimate per stage — the courier tightens it as the card moves. */
const LANDED: Estimate = { days: 0, date: "Mon 11 Mar" };
const ETA: Estimate[] = [
  { days: 4, date: "Thu 14 Mar" },
  { days: 2, date: "Tue 12 Mar" },
  { days: 1, date: "Mon 11 Mar" },
  LANDED,
];

const CONTROL =
  "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function CardOrderDemo() {
  const [stage, setStage] = React.useState(0);
  const last = STAGES.length - 1;
  const eta = ETA[stage] ?? LANDED;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CardOrder
        label="Replacement card"
        stages={STAGES}
        stage={stage}
        etaDays={eta.days}
        etaDate={eta.date}
        reference="CBK-4417-2F"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStage((current) => Math.min(last, current + 1))}
          disabled={stage === last}
          className={CONTROL}
        >
          Advance
        </button>
        <button
          type="button"
          onClick={() => setStage(0)}
          disabled={stage === 0}
          className={CONTROL}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Order CBK-4417-2F ·{" "}
        <span className="text-cobalt-bright">{STAGES[stage]?.label}</span> ·{" "}
        {stage === last
          ? "Delivered"
          : `Arrives in ${eta.days} ${eta.days === 1 ? "day" : "days"}`}
      </p>
    </div>
  );
}
