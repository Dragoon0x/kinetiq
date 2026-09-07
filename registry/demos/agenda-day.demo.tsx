"use client";

import * as React from "react";

import { AgendaDay, type AgendaEvent } from "@/registry/ui/agenda-day";

/** Minutes from midnight — a fixed day, never Date.now(). */
const DAY: AgendaEvent[] = [
  { id: "yard", title: "Yard check", start: 510, end: 555 },
  { id: "brief", title: "Route brief", start: 570, end: 660 },
  {
    id: "permit",
    title: "Permit call",
    start: 615,
    end: 675,
    tint: "var(--warn)",
  },
  { id: "swap", title: "Depot swap", start: 720, end: 780 },
  {
    id: "survey",
    title: "Line survey",
    start: 870,
    end: 960,
    tint: "var(--signal)",
  },
];

const DAY_END = 18 * 60;

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;

export function AgendaDayDemo() {
  const [day, setDay] = React.useState(DAY);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  /** The line is driven by a prop, so the first paint matches the server's. */
  const [now, setNow] = React.useState(800);

  React.useEffect(() => {
    const timer = window.setInterval(
      () => setNow((minutes) => Math.min(minutes + 4, DAY_END)),
      2000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const focused = day.find((event) => event.id === activeId);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AgendaDay
        label="Fieldline dispatch"
        events={DAY}
        hours={[8, 18]}
        now={now}
        onChange={setDay}
        onActiveChange={setActiveId}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {focused ? (
          <>
            {focused.title} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {clock(focused.start)}–{clock(focused.end)}
            </span>
          </>
        ) : (
          "Focus an event, then drag it or nudge it with the arrows"
        )}
      </p>
    </div>
  );
}
