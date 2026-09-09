"use client";

import * as React from "react";

import { GoalTimeline, projectGoalMonths } from "@/registry/ui/goal-timeline";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Basinworks, the house deposit: a fixed start so the sweep sees one page. */
const SAVED = 8400;
const GOAL = 20000;
const START = { year: 2026, month: 9 };
const HORIZON = 36;

export function GoalTimelineDemo() {
  const [monthly, setMonthly] = React.useState(400);

  const months = projectGoalMonths(SAVED, GOAL, monthly);
  const index = START.month - 1 + months;
  const when = `${MONTHS[index % 12]} ${START.year + Math.floor(index / 12)}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GoalTimeline
        label="House deposit"
        saved={SAVED}
        goal={GOAL}
        monthly={monthly}
        onMonthlyChange={setMonthly}
        start={START}
        horizonMonths={HORIZON}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {money.format(monthly)} a month ·{" "}
        {months === 0
          ? "reached"
          : months > HORIZON
            ? `beyond ${HORIZON} months`
            : `${months} months · ${when}`}
      </p>
    </div>
  );
}
