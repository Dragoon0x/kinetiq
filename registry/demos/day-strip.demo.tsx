"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DayStrip } from "@/registry/ui/day-strip";

export const tweaks = defineTweaks({
  friction: {
    kind: "range",
    label: "Friction",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lens: {
    kind: "range",
    label: "Lens",
    default: 1.3,
    min: 1,
    max: 1.6,
    step: 0.1,
    unit: "×",
  },
  visible: {
    kind: "range",
    label: "Visible",
    default: 7,
    min: 5,
    max: 9,
    step: 2,
    unit: "days",
  },
  dots: { kind: "toggle", label: "Dots", default: true },
});

type Slot = { time: string; title: string };

/** The Fieldline design team's next five weeks. */
const AGENDA: Readonly<Record<string, readonly Slot[]>> = {
  "2026-09-29": [{ time: "09:30", title: "Sprint planning" }],
  "2026-10-01": [
    { time: "11:00", title: "Roadmap review" },
    { time: "16:00", title: "Hiring panel" },
  ],
  "2026-10-02": [{ time: "10:00", title: "Waylight Pay sync" }],
  "2026-10-05": [{ time: "09:30", title: "Stand-up" }],
  "2026-10-06": [
    { time: "10:00", title: "Design review" },
    { time: "15:30", title: "1:1 with Jo" },
  ],
  "2026-10-08": [
    { time: "09:00", title: "Research readout" },
    { time: "13:00", title: "Coldbrook Bank demo" },
    { time: "17:00", title: "Team drinks" },
  ],
  "2026-10-12": [{ time: "09:30", title: "Sprint planning" }],
  "2026-10-14": [{ time: "14:00", title: "Accessibility audit" }],
  "2026-10-16": [{ time: "11:00", title: "Release 4.2" }],
  "2026-10-19": [{ time: "10:00", title: "Gaugeworks workshop" }],
  "2026-10-21": [
    { time: "10:00", title: "Design review" },
    { time: "15:00", title: "Basinworks kickoff" },
  ],
  "2026-10-26": [{ time: "09:30", title: "Sprint planning" }],
  "2026-10-29": [{ time: "16:00", title: "Quarterly demo" }],
  "2026-10-30": [{ time: "12:00", title: "Offsite lunch" }],
};

const EVENTS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(AGENDA).map(([day, slots]) => [day, slots.length]),
);

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/** "tue 6 oct", from an ISO date, in UTC like the strip. */
function spoken(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
  return `${WEEKDAYS[date.getUTCDay()] ?? ""} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""}`;
}

/**
 * The Fieldline design team's calendar: five weeks from Monday 28 September,
 * today Tuesday 6 October. Throw the strip; the day that lands under the
 * lens is the one the agenda shows.
 */
export function DayStripDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [day, setDay] = React.useState("2026-10-06");
  const slots = AGENDA[day] ?? [];
  const next = slots[0];

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <DayStrip
        label="Fieldline team calendar"
        start="2026-09-28"
        days={35}
        today="2026-10-06"
        events={EVENTS}
        value={day}
        onValueChange={setDay}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{spoken(day)}</span>
          {next
            ? ` · ${slots.length === 1 ? "1 event" : `${slots.length} events`} · ${next.title} ${next.time}`
            : " · nothing booked"}
        </p>
      ) : null}
    </div>
  );
}
