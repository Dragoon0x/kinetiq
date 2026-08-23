"use client";

import * as React from "react";

import { BarRace, type BarRaceItem } from "@/registry/ui/bar-race";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { cn } from "@/registry/lib/utils";

export type RankPeriod = {
  id: string;
  /** Short label for the control. */
  label: string;
  /** The line that says what changed in this period. */
  note: string;
  items: BarRaceItem[];
};

export type StatsRankRaceProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  periods?: RankPeriod[];
  /** Formats the trailing readout on each bar. */
  unit?: string;
  className?: string;
};

const DEFAULT_PERIODS: RankPeriod[] = [
  {
    id: "y1",
    label: "2023",
    note: "Bulk still carried the floor, and project cargo was a rounding error.",
    items: [
      { id: "bulk", label: "Bulk", value: 4120 },
      { id: "container", label: "Container", value: 2980 },
      { id: "ro-ro", label: "Ro-ro", value: 1640 },
      { id: "project", label: "Project", value: 410 },
      { id: "cold", label: "Cold", value: 260 },
    ],
  },
  {
    id: "y2",
    label: "2024",
    note: "Container closed most of the gap; project cargo tripled off a small base.",
    items: [
      { id: "bulk", label: "Bulk", value: 4480 },
      { id: "container", label: "Container", value: 4210 },
      { id: "ro-ro", label: "Ro-ro", value: 1890 },
      { id: "project", label: "Project", value: 1230 },
      { id: "cold", label: "Cold", value: 540 },
    ],
  },
  {
    id: "y3",
    label: "2025",
    note: "Container took the lead. Project cargo is now bigger than ro-ro was two years ago.",
    items: [
      { id: "container", label: "Container", value: 6350 },
      { id: "bulk", label: "Bulk", value: 4610 },
      { id: "project", label: "Project", value: 2470 },
      { id: "ro-ro", label: "Ro-ro", value: 2020 },
      { id: "cold", label: "Cold", value: 880 },
    ],
  },
];

/**
 * Standings that re-rank in front of you: pick a year and the bars re-order
 * themselves, so the story is the movement rather than the values. The band
 * and the dial both answer "how much"; this one answers "who overtook whom",
 * which is the only question a ranked list is actually good at. Re-ranking,
 * bar travel, and the trailing readouts all belong to the race instrument.
 */
export function StatsRankRace({
  eyebrow = "Waylight · mornings cut, by trade",
  headline = "Watch the order change.",
  copy = "Three years of boards, by cargo type. Step through them and the ranking rearranges itself.",
  periods = DEFAULT_PERIODS,
  unit = "boards",
  className,
}: StatsRankRaceProps) {
  const headingId = React.useId();
  const [active, setActive] = React.useState(
    periods[periods.length - 1]?.id ?? "",
  );

  const current =
    periods.find((period) => period.id === active) ??
    periods[periods.length - 1];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="-mx-6 mt-8 overflow-x-auto px-6 pb-1">
          <SegmentedControl
            value={active}
            onValueChange={setActive}
            aria-label="Choose a year"
            className="w-max"
          >
            {periods.map((period) => (
              <SegmentedControlItem key={period.id} value={period.id}>
                {period.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>

        <div className="mt-6 rounded-4 border border-hairline bg-surface-1 p-6">
          <BarRace
            items={current?.items ?? []}
            format={(value) => `${value.toLocaleString("en-US")} ${unit}`}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          {current?.note}
        </p>
      </div>
    </section>
  );
}
