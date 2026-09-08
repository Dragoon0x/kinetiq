"use client";

import * as React from "react";

import {
  DividendCalendar,
  type DividendMonth,
  type DividendPayout,
} from "@/registry/ui/dividend-calendar";

/** Amounts are held in cents so a month's total cannot drift the way floats do. */
const pay = (day: number, symbol: string, cents: number): DividendPayout => ({
  day,
  symbol,
  amount: cents / 100,
});

const AUGUST: DividendMonth = {
  id: "aug",
  label: "August",
  days: 31,
  // Six week rows against September's five: the card measures the change and
  // glides between them rather than reserving a blank row for the taller month.
  startWeekday: 5,
  payouts: [
    pay(5, "BSN", 1840),
    pay(12, "FRN", 940),
    pay(19, "CBK", 2615),
    pay(26, "WAY", 705),
  ],
};

const SEPTEMBER: DividendMonth = {
  id: "sep",
  label: "September",
  days: 30,
  startWeekday: 1,
  payouts: [
    pay(2, "GGE", 1120),
    pay(9, "BSN", 1840),
    pay(12, "FLD", 480),
    pay(18, "CBK", 2615),
    pay(23, "FRN", 940),
    pay(30, "WAY", 705),
  ],
};

const OCTOBER: DividendMonth = {
  id: "oct",
  label: "October",
  days: 31,
  startWeekday: 3,
  payouts: [pay(7, "BSN", 1985), pay(15, "CBK", 2615), pay(29, "FRN", 1010)],
};

const MONTHS = [AUGUST, SEPTEMBER, OCTOBER];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function DividendCalendarDemo() {
  const [monthId, setMonthId] = React.useState(SEPTEMBER.id);
  const [reading, setReading] = React.useState<{
    day: number;
    payout: DividendPayout | null;
  } | null>(null);

  const month = MONTHS.find((entry) => entry.id === monthId) ?? SEPTEMBER;
  const short = month.label.slice(0, 3);
  const total = month.payouts.reduce((sum, payout) => sum + payout.amount, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <DividendCalendar
        label="Waylight Pay · income calendar"
        months={MONTHS}
        value={monthId}
        onValueChange={setMonthId}
        onDayRead={(day, payout) =>
          setReading(day === null ? null : { day, payout })
        }
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {short} · <span className="tabular-nums">{month.payouts.length}</span>{" "}
        payouts · total{" "}
        <span className="text-signal tabular-nums">{money.format(total)}</span>{" "}
        · reading{" "}
        {reading ? (
          <span className="tabular-nums">
            {reading.payout ? `${reading.payout.symbol} ` : "no pay "}
            {reading.day} {short}
          </span>
        ) : (
          <span>&mdash;</span>
        )}
      </p>
    </div>
  );
}
