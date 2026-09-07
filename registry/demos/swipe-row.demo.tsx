"use client";

import * as React from "react";

import { SwipeRow } from "@/registry/ui/swipe-row";

const INBOX = [
  {
    id: "fx-1",
    from: "Fieldline depot",
    subject: "Sweep sheet for run 118",
    time: "09:12",
  },
  {
    id: "fx-2",
    from: "Rosa Amberlink",
    subject: "Clamp torque on the north bench",
    time: "08:40",
  },
  {
    id: "fx-3",
    from: "Basinworks",
    subject: "Crate 12 signed for at the gate",
    time: "Tue",
  },
];

type Mark = "archived" | "deleted";

export function SwipeRowDemo() {
  const [marks, setMarks] = React.useState<Record<string, Mark>>({});
  const [last, setLast] = React.useState("none");

  const mark = (id: string, from: string, next: Mark) => {
    setMarks((prev) => ({ ...prev, [id]: next }));
    setLast(`${next} · ${from}`);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ul className="flex list-none flex-col divide-y divide-hairline rounded-3 border border-border bg-card p-0">
        {INBOX.map((mail) => (
          <SwipeRow
            key={mail.id}
            menuLabel={`Actions for ${mail.subject}`}
            leading={[
              {
                id: "archive",
                label: "Archive",
                icon: "archive",
                onSelect: () => mark(mail.id, mail.from, "archived"),
              },
            ]}
            trailing={[
              {
                id: "delete",
                label: "Delete",
                icon: "trash",
                tone: "danger",
                onSelect: () => mark(mail.id, mail.from, "deleted"),
              },
            ]}
          >
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {mail.from}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {mail.time}
              </span>
            </div>
            <p
              className={`truncate text-xs ${
                marks[mail.id] ? "text-ink-3 line-through" : "text-ink-2"
              }`}
            >
              {mail.subject}
            </p>
            {marks[mail.id] ? (
              <span className="mt-1 inline-flex h-5 items-center rounded-full border border-hairline px-2 text-[10px] text-ink-3">
                {marks[mail.id]}
              </span>
            ) : null}
          </SwipeRow>
        ))}
      </ul>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Last <span className="text-[var(--signal,var(--primary))]">{last}</span>
      </p>
    </div>
  );
}
