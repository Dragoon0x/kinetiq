"use client";

import * as React from "react";

import { BalanceCard } from "@/registry/blocks/balance-card/balance-card";

const SERIES = [11840, 11920, 11875, 12040, 12180, 12110, 12260, 12345, 12290, 12410, 12385, 12480.5];

const ACTIVITY = [
  { id: "a1", label: "Bench slot refund", amount: "+12.50", time: "TODAY · 09:12" },
  { id: "a2", label: "Calibration cert", amount: "−29.00", time: "YESTERDAY · 16:40" },
  { id: "a3", label: "Credit top-up", amount: "+150.00", time: "JUL 05 · 11:02" },
  { id: "a4", label: "Field kit rental", amount: "−48.00", time: "JUL 03 · 14:26" },
];

export function BalanceCardDemo() {
  const [event, setEvent] = React.useState("READY");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <BalanceCard
        title="Lab credits"
        balance={12480.5}
        delta={{ value: "+2.4%", direction: "up" }}
        series={SERIES}
        activity={ACTIVITY}
        onAction={(action) => setEvent(action.toUpperCase())}
      />
      <p
        role="status"
        className="text-muted-foreground font-mono text-xs tracking-wide"
      >
        LAST ACTION · {event}
      </p>
    </div>
  );
}
