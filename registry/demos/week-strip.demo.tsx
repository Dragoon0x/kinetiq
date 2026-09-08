"use client";

import * as React from "react";

import {
  WeekStrip,
  type SpendDay,
  type SpendWeek,
} from "@/registry/ui/week-strip";

const NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Amounts are held in cents so a week's total cannot drift the way floats do. */
const week = (
  id: string,
  label: string,
  cents: number[],
  todayIndex?: number,
): SpendWeek => ({
  id,
  label,
  days: cents.map((amount, index) => ({
    label: NAMES[index] ?? "",
    amount: amount / 100,
  })),
  todayIndex,
});

const THIS_WEEK = week(
  "oct20",
  "Week of Oct 20",
  [4120, 6890, 8410, 2235, 5740, 9680, 4215],
  6,
);

const WEEKS: SpendWeek[] = [
  week("oct6", "Week of Oct 6", [4210, 1885, 7640, 2260, 9130, 12450, 3320]),
  week("oct13", "Week of Oct 13", [5480, 3210, 2075, 8890, 6640, 4125, 1890]),
  THIS_WEEK,
];

const BUDGET = 60;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function WeekStripDemo() {
  const [weekId, setWeekId] = React.useState(THIS_WEEK.id);
  const [reading, setReading] = React.useState<SpendDay | null>(null);

  const current = WEEKS.find((entry) => entry.id === weekId) ?? THIS_WEEK;
  const total = current.days.reduce((sum, day) => sum + day.amount, 0);
  const over = current.days.filter((day) => day.amount > BUDGET).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <WeekStrip
        label="Waylight Pay · card spend"
        weeks={WEEKS}
        dailyBudget={BUDGET}
        value={weekId}
        onValueChange={setWeekId}
        onDayChange={(day) => setReading(day)}
        format={(value) => money.format(value)}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {current.label} ·{" "}
        <span className="text-signal tabular-nums">{money.format(total)}</span>{" "}
        · <span className="tabular-nums">{over}</span> days over · reading{" "}
        {reading ? (
          <span className="tabular-nums">
            {reading.label} {money.format(reading.amount)}
          </span>
        ) : (
          <span>&mdash;</span>
        )}
      </p>
    </div>
  );
}
