"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CalendarApp,
  defaultCalendarEvents,
  defaultCalendarNow,
  type CalendarView,
} from "@/registry/ui/calendar-app";

export const tweaks = defineTweaks({
  view: {
    kind: "choice",
    label: "View",
    default: "month",
    options: ["month", "week"],
    names: { month: "Month", week: "Week" },
  },
  drawer: {
    kind: "choice",
    label: "Drawer",
    default: "side",
    options: ["side", "over", "sheet"],
    names: { side: "Side", over: "Over", sheet: "Sheet" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const DAY = 86_400_000;
const MONTHS =
  "january february march april may june july august september october november december".split(
    " ",
  );
const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

/**
 * Gaugeworks' product team in October 2026, read on Friday 2 October at
 * 10:20: a design review in ten minutes, the sprint demo after lunch.
 */
export function CalendarAppDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [events, setEvents] = React.useState(defaultCalendarEvents);
  const [day, setDay] = React.useState(
    Math.floor(defaultCalendarNow / DAY) * DAY,
  );
  const [selected, setSelected] = React.useState<string | null>("review");
  const [told, setTold] = React.useState<string | null>(null);
  // The tweak sets where the view starts; the switch moves it from there.
  const [view, setView] = React.useState<CalendarView>(values.view ?? "month");
  const [seenView, setSeenView] = React.useState(values.view);
  if (seenView !== values.view) {
    setSeenView(values.view);
    if (values.view !== undefined) setView(values.view);
  }

  const app = (
    <CalendarApp
      sound={sound}
      {...values}
      view={view}
      onViewChange={(v) => {
        setView(v);
        setTold(null);
      }}
      events={events}
      onEventsChange={(next) => {
        const before = new Map(events.map((e) => [e.id, e]));
        const moved = next.find((e) => {
          const was = before.get(e.id);
          return was && (was.start !== e.start || was.end !== e.end);
        });
        if (moved)
          setTold(`moved ${moved.title.toLowerCase()} to ${hhmm(moved.start)}`);
        setEvents(next);
      }}
      day={day}
      onDayChange={(d) => {
        setDay(d);
        setTold(null);
      }}
      selected={selected}
      onSelectedChange={setSelected}
      onCreate={(e) => setTold(`created ${e.title.toLowerCase()}`)}
      onDelete={(e) => setTold(`deleted ${e.title.toLowerCase()}`)}
      onJoinedChange={(id, joined) => {
        const e = events.find((x) => x.id === id);
        setTold(
          `${joined ? "joined" : "left"} ${e?.title.toLowerCase() ?? "the meeting"}`,
        );
      }}
    />
  );

  if (!chrome) return <div className="w-full">{app}</div>;

  const d = new Date(day);
  const month = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const today = Math.floor(defaultCalendarNow / DAY) * DAY;
  const todays = events.filter(
    (e) => Math.floor(e.start / DAY) * DAY === today,
  );
  const next = todays
    .filter((e) => e.start > defaultCalendarNow)
    .sort((a, b) => a.start - b.start)[0];
  const open = events.find((e) => e.id === selected);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {app}
      <p
        role="status"
        className="truncate border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            <span className="text-signal">drawer open</span> ·{" "}
            {open.title.toLowerCase()} · escape closes
          </>
        ) : told ? (
          <>
            <span className="text-signal">{told}</span> · {view}
          </>
        ) : (
          <>
            <span className="text-signal">{month}</span> · {view} ·{" "}
            {todays.length} today
            {next
              ? ` · next ${next.title.toLowerCase()} in ${Math.round((next.start - defaultCalendarNow) / 60000)} min`
              : ""}
          </>
        )}
      </p>
    </div>
  );
}
