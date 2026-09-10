"use client";

import * as React from "react";

import { AvailabilityGrid } from "@/registry/ui/availability-grid";

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const DAYS = ["Tue", "Wed", "Thu", "Fri"];
const TIMES = ["08:00", "13:00", "18:00"];
const PEOPLE = 6;

/** Marta's and Ines's answers, seeded so the grid reads the same every time. */
const BASE: Record<string, number> = {
  "0-1": 2,
  "0-2": 1,
  "1-0": 2,
  "1-1": 3,
  "1-2": 2,
  "2-0": 1,
  "2-1": 3,
  "2-2": 4,
  "3-1": 2,
  "3-2": 3,
};

/** What the grid holds once Rui has answered too. */
const AFTER_RUI: Record<string, number> = { "1-1": 4, "2-2": 5, "3-2": 4 };

export function AvailabilityGridDemo() {
  const [mine, setMine] = React.useState<string[]>([]);
  const [rui, setRui] = React.useState(false);
  const [decided, setDecided] = React.useState<string | null>(null);

  const votes = rui ? { ...BASE, ...AFTER_RUI } : BASE;
  const countAt = (key: string) =>
    (votes[key] ?? 0) + (mine.includes(key) ? 1 : 0);
  const slots = DAYS.flatMap((_, day) =>
    TIMES.map((__, time) => `${day}-${time}`),
  );
  const leader = slots.reduce(
    (held, key) => (countAt(key) > countAt(held) ? key : held),
    "0-0",
  );
  const shown = decided ?? leader;
  const parts = shown.split("-");
  const slotName = `${DAYS[Number(parts[0])] ?? ""} ${TIMES[Number(parts[1])] ?? ""}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ol role="list" className="flex flex-col gap-2">
        <li className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-3">Marta Ferreira · 08:55</span>
          <span className="text-sm leading-snug">
            When can everyone make the depot run?
          </span>
          <AvailabilityGrid
            days={DAYS}
            times={TIMES}
            people={PEOPLE}
            votes={votes}
            mine={mine}
            onMineChange={setMine}
            decided={decided}
            onPost={setDecided}
            label="When the depot room is free"
          />
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRui(true)}
          disabled={rui || decided !== null}
          className={chip}
        >
          Rui answers
        </button>
        <button
          type="button"
          onClick={() => {
            setMine([]);
            setRui(false);
            setDecided(null);
          }}
          disabled={mine.length === 0 && !rui && decided === null}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {decided ? "Posted · " : `${countAt(leader)} of ${PEOPLE} · `}
        <span className="text-signal">
          {slotName}
          {decided ? "" : " leads"}
        </span>
      </p>
    </div>
  );
}
