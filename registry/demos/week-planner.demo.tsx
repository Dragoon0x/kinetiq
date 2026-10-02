"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultWeekEvents,
  WeekPlanner,
  type WeekEvent,
} from "@/registry/ui/week-planner";

export const tweaks = defineTweaks({
  snap: {
    kind: "range",
    label: "Snap",
    default: 15,
    min: 5,
    max: 30,
    step: 5,
    unit: "min",
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  now: {
    kind: "range",
    label: "Now",
    default: 13.5,
    min: 7,
    max: 19,
    step: 0.25,
    unit: "h",
  },
});

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const when = (e: WeekEvent) =>
  `${DAYS[new Date(e.start).getUTCDay()] ?? ""} ${clock(e.start)}–${clock(e.end)}`;
const hours = (h: number) =>
  `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;

/**
 * Gaugeworks' product team on Thursday 1 October 2026: stand-ups, reviews,
 * focus blocks and a dentist, with room to draw more.
 */
export function WeekPlannerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [events, setEvents] = React.useState(defaultWeekEvents);
  const [note, setNote] = React.useState<string | null>(null);

  const reset = () => {
    setRun((r) => r + 1);
    setEvents(defaultWeekEvents);
    setNote(null);
  };

  const planner = (
    <WeekPlanner
      key={run}
      onEventsChange={setEvents}
      onCreate={(e) => setNote(`added “${e.title.toLowerCase()}” ${when(e)}`)}
      onUpdate={(e, prev) =>
        setNote(
          e.title !== prev.title
            ? `renamed “${e.title.toLowerCase()}”`
            : e.calendar !== prev.calendar
              ? `“${e.title.toLowerCase()}” changed calendar`
              : e.start !== prev.start &&
                  e.end - e.start === prev.end - prev.start
                ? `moved “${e.title.toLowerCase()}” to ${when(e)}`
                : `“${e.title.toLowerCase()}” now ${when(e)}`,
        )
      }
      onDelete={(e) => setNote(`deleted “${e.title.toLowerCase()}”`)}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{planner}</div>;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {planner}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">{hours(values.now ?? 13.5)}</span> ·{" "}
              {events.length} events this week · drag across empty time to add
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
