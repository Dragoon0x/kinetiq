"use client";

import * as React from "react";

import { CashDrawer, type CashDenomination } from "@/registry/ui/cash-drawer";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Till 2 at end of shift: 483.75 in the tray against a 480.00 float. */
const TRAY: CashDenomination[] = [
  { value: 50, count: 4 },
  { value: 20, count: 8 },
  { value: 10, count: 6 },
  { value: 5, count: 9 },
  { value: 1, count: 12 },
  { value: 0.25, count: 27, kind: "coin" },
];

const EXPECTED = 480;

export function CashDrawerDemo() {
  const [open, setOpen] = React.useState(false);
  const [counting, setCounting] = React.useState(false);
  const [tallied, setTallied] = React.useState<number | null>(null);

  const variance =
    tallied === null ? 0 : Math.round((tallied - EXPECTED) * 100) / 100;
  const varianceText =
    variance === 0
      ? "level"
      : variance > 0
        ? `over ${currency.format(variance)}`
        : `short ${currency.format(-variance)}`;

  const status = !open
    ? tallied === null
      ? "Locked"
      : `Locked · ${currency.format(tallied)}`
    : counting
      ? "Counting"
      : tallied === null
        ? "Open · not counted"
        : `Counted ${currency.format(tallied)} · ${varianceText}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CashDrawer
        label="Waylight Pay · Till 2"
        denominations={TRAY}
        expected={EXPECTED}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setTallied(null);
            setCounting(false);
          }
        }}
        onCount={() => setCounting(true)}
        onTallied={(total) => {
          setCounting(false);
          setTallied(total);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span>
      </p>
    </div>
  );
}
