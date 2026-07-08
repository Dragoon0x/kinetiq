"use client";

import { ExchangePanel } from "@/registry/blocks/exchange-panel/exchange-panel";

const UNITS = [
  {
    label: "Currency",
    units: [
      { id: "usd", label: "USD", factor: 1 },
      { id: "eur", label: "EUR", factor: 1.09 },
    ],
  },
  {
    label: "Data",
    units: [
      { id: "gb", label: "GB", factor: 1 },
      { id: "mb", label: "MB", factor: 1 / 1024 },
    ],
  },
  {
    label: "Time",
    units: [
      { id: "hr", label: "Hours", factor: 60 },
      { id: "min", label: "Minutes", factor: 1 },
    ],
  },
];

export function ExchangePanelDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <ExchangePanel units={UNITS} defaultAmount={2} feeRate={0.004} />
      <p className="text-muted-foreground text-xs">
        Type either side · swap mid-edit
      </p>
    </div>
  );
}
