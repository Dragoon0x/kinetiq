"use client";

import * as React from "react";

import { AlmanacPicker, type AlmanacValue } from "@/registry/ui/almanac-picker";

const SHORT = [
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

/** Seeded to a fixed month so the specimen renders the same on every pass. */
const SEED: [Date, Date | null] = [
  new Date(2026, 4, 14),
  new Date(2026, 4, 18),
];
const SEASON_OPENS = new Date(2026, 3, 1);
const SEASON_CLOSES = new Date(2026, 6, 31);

const label = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`;

export function AlmanacPickerDemo() {
  const [stay, setStay] = React.useState<AlmanacValue>(SEED);
  const [start, end] = Array.isArray(stay) ? stay : [null, null];
  const nights =
    start && end
      ? Math.round((end.getTime() - start.getTime()) / 86_400_000)
      : 0;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5">
      <AlmanacPicker
        mode="range"
        label="Basinworks stay"
        value={stay}
        onValueChange={setStay}
        min={SEASON_OPENS}
        max={SEASON_CLOSES}
      />

      <p
        role="status"
        className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Basinworks stay{" "}
        <span className="text-cobalt-bright">
          {start ? label(start) : "—"} to {end ? label(end) : "open"}
        </span>{" "}
        · {nights} {nights === 1 ? "night" : "nights"}
      </p>
    </div>
  );
}
