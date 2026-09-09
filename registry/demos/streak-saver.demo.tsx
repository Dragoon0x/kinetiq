"use client";

import * as React from "react";

import { StreakSaver, type StreakWeek } from "@/registry/ui/streak-saver";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A fixed Monday and a UTC formatter: the same labels on server and client. */
const FIRST_WEEK = Date.UTC(2026, 5, 15);
const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const labelFor = (index: number) =>
  day.format(new Date(FIRST_WEEK + index * 7 * 86_400_000));

const AMOUNT = 25;
const SHOWN = 12;
/** Twelve weeks of Waylight Pay history: two misses, a run of six, this week open. */
const SEED = [1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0];

const seedWeeks = (): StreakWeek[] =>
  SEED.map((saved, index) => ({
    id: `w${index}`,
    label: labelFor(index),
    saved: saved === 1,
  }));

const buttonClass =
  "h-8 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function StreakSaverDemo() {
  const [weeks, setWeeks] = React.useState<StreakWeek[]>(seedWeeks);
  const [nextIndex, setNextIndex] = React.useState(SEED.length);
  const [lastEvent, setLastEvent] = React.useState<"save" | "advance" | null>(
    null,
  );

  const current = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2];
  // An open current week is left out of the run; it is at risk, not broken.
  const run = current?.saved ? weeks : weeks.slice(0, -1);
  let streak = 0;
  for (
    let index = run.length - 1;
    index >= 0 && run[index]?.saved;
    index -= 1
  ) {
    streak += 1;
  }
  const putAway = weeks.filter((week) => week.saved).length * AMOUNT;
  const ended =
    lastEvent === "advance" && streak === 0 && previous?.saved === false;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StreakSaver
        label="Rainy day"
        weeks={weeks}
        amount={AMOUNT}
        onSave={(weekId) => {
          setWeeks((prev) =>
            prev.map((week) =>
              week.id === weekId ? { ...week, saved: true } : week,
            ),
          );
          setLastEvent("save");
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setWeeks((prev) => [
              ...prev.slice(prev.length >= SHOWN ? 1 : 0),
              { id: `w${nextIndex}`, label: labelFor(nextIndex), saved: false },
            ]);
            setNextIndex((index) => index + 1);
            setLastEvent("advance");
          }}
        >
          Next week
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setWeeks(seedWeeks());
            setNextIndex(SEED.length);
            setLastEvent(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ended ? "Streak ended · " : ""}
        {streak} in a row · This week {current?.saved ? "saved" : "open"} ·{" "}
        {money.format(putAway)} put away
      </p>
    </div>
  );
}
