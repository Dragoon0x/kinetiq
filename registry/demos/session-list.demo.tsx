"use client";

import * as React from "react";

import { SessionList, type SessionItem } from "@/registry/ui/session-list";

const SESSIONS: SessionItem[] = [
  {
    id: "s1",
    device: "Waylight laptop",
    kind: "laptop",
    place: "Lisbon",
    seen: "now",
    current: true,
  },
  {
    id: "s2",
    device: "Coldbrook phone",
    kind: "phone",
    place: "Porto",
    seen: "2 h ago",
  },
  {
    id: "s3",
    device: "Fieldline tablet",
    kind: "tablet",
    place: "Lisbon",
    seen: "yesterday",
  },
  {
    id: "s4",
    device: "Gaugeworks laptop",
    kind: "laptop",
    place: "Madrid",
    seen: "3 d ago",
  },
];

export function SessionListDemo() {
  const [sessions, setSessions] = React.useState(SESSIONS);
  const [last, setLast] = React.useState<string | null>(null);

  const others = sessions.length - 1;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SessionList
        label="Basinworks Exchange"
        sessions={sessions}
        onSignOut={(id) => {
          const gone = sessions.find((session) => session.id === id);
          setSessions((previous) =>
            previous.filter((session) => session.id !== id),
          );
          if (gone) setLast(`signed out ${gone.device}`);
        }}
        onSignOutAll={(ids) => {
          setSessions((previous) =>
            previous.filter((session) => !ids.includes(session.id)),
          );
          setLast("signed out all");
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={sessions.length === SESSIONS.length}
          onClick={() => {
            setSessions(SESSIONS);
            setLast(null);
          }}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Restore
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal tabular-nums">{sessions.length}</span>{" "}
        {sessions.length === 1 ? "session" : "sessions"} ·{" "}
        <span className="tabular-nums">{others}</span> other
        {last ? ` · ${last}` : ""}
      </p>
    </div>
  );
}
