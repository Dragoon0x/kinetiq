"use client";

import * as React from "react";

import { BillCalendar, type Bill } from "@/registry/ui/bill-calendar";

const OPENING = 2180;

const SCHEDULE: Bill[] = [
  { id: "rent", label: "Fernworks Rent", amount: 1150, day: 3 },
  { id: "power", label: "Waylight Power", amount: 84, day: 9 },
  { id: "water", label: "Basin Water", amount: 46, day: 14 },
  { id: "mobile", label: "Gaugeworks Mobile", amount: 38, day: 21 },
  { id: "card", label: "Coldbrook Card", amount: 320, day: 26 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The trough of the running balance, and the day it lands on. */
function trough(list: Bill[]) {
  let running = OPENING;
  let low = OPENING;
  let day = 1;
  for (const bill of [...list].sort((a, b) => a.day - b.day)) {
    running -= bill.amount;
    if (running < low) {
      low = running;
      day = bill.day;
    }
  }
  return { low, day };
}

export function BillCalendarDemo() {
  const [bills, setBills] = React.useState<Bill[]>(SCHEDULE);
  const [moved, setMoved] = React.useState<string | null>(null);

  const due = bills.reduce((sum, bill) => sum + bill.amount, 0);
  const { low, day } = trough(bills);
  const untouched = bills.every(
    (bill, index) => bill.day === SCHEDULE[index]?.day,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BillCalendar
        label="Coldbrook Bank · November bills"
        monthLabel="November"
        bills={bills}
        onBillsChange={setBills}
        onBillMove={(bill, from, to) =>
          setMoved(`${bill.label} ${from} → ${to}`)
        }
        openingBalance={OPENING}
        days={30}
        startWeekday={5}
        format={(value) => money.format(value)}
      />

      <button
        type="button"
        disabled={untouched}
        onClick={() => {
          setBills(SCHEDULE);
          setMoved(null);
        }}
        className="inline-flex h-8 w-fit items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        Reset days
      </button>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        November · <span className="tabular-nums">{bills.length}</span> bills{" "}
        <span className="tabular-nums">{money.format(due)}</span> · low{" "}
        <span className="text-signal tabular-nums">{money.format(low)}</span> on
        the <span className="tabular-nums">{day}</span> ·{" "}
        {moved ? (
          <span className="tabular-nums">moved {moved}</span>
        ) : (
          <span>no moves yet</span>
        )}
      </p>
    </div>
  );
}
