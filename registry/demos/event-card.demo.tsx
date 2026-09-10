"use client";

import * as React from "react";

import {
  EventCard,
  type EventAttendee,
  type RsvpStatus,
} from "@/registry/ui/event-card";

const CREW: EventAttendee[] = [
  { id: "ines", name: "Ines Corvo", status: "going" },
  { id: "rui", name: "Rui Baptista", status: "going" },
  { id: "ana", name: "Ana Reis", status: "going" },
  { id: "nuno", name: "Nuno Faro", status: "going" },
  { id: "tomas", name: "Tomas Vale", status: "maybe" },
];

/** The demo's own late answer, so the count always rolls the same way. */
const LATE: EventAttendee = { id: "elsa", name: "Elsa Mota", status: "going" };

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function EventCardDemo() {
  const [crew, setCrew] = React.useState(CREW);
  const [rsvp, setRsvp] = React.useState<RsvpStatus | null>(null);

  const hasLate = crew.some((one) => one.id === LATE.id);
  const going =
    crew.filter((one) => one.status === "going").length +
    (rsvp === "going" ? 1 : 0);
  const maybes =
    crew.filter((one) => one.status === "maybe").length +
    (rsvp === "maybe" ? 1 : 0);

  const answer =
    rsvp === "going"
      ? "going"
      : rsvp === "maybe"
        ? "maybe"
        : rsvp === "no"
          ? "cannot come"
          : "no answer yet";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <EventCard
        label="Basinworks yard thread"
        peerName="Marta"
        you="You"
        capacity={8}
        event={{
          id: "event-1",
          from: "peer",
          title: "Walk-through of the new bay",
          when: "Thursday, 09:30",
          where: "Basinworks yard, bay four",
          time: "11:42",
        }}
        attendees={crew}
        value={rsvp}
        onValueChange={setRsvp}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={hasLate}
          onClick={() => setCrew((prev) => [...prev, LATE])}
        >
          A colleague answers
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => {
            setCrew(CREW);
            setRsvp(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-[var(--signal,var(--primary))]">{answer}</span> ·{" "}
        {going} of 8 going · {maybes === 1 ? "1 maybe" : `${maybes} maybes`}
      </p>
    </div>
  );
}
