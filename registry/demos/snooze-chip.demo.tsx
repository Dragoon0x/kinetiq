"use client";

import * as React from "react";

import { SnoozeChip } from "@/registry/ui/snooze-chip";

/** The demo clock runs 300×, so a twenty-minute snooze wakes in four seconds. */
const TICK_MS = 200;
const DAY = 1440;

const clockOf = (minute: number): string => {
  const total = ((Math.round(minute) % DAY) + DAY) % DAY;
  const hour24 = Math.floor(total / 60);
  const rest = total % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(rest).padStart(2, "0")} ${hour24 < 12 ? "am" : "pm"}`;
};

export function SnoozeChipDemo() {
  const [now, setNow] = React.useState(945);
  const [snooze, setSnooze] = React.useState<{
    label: string;
    wakeMinutes: number;
  } | null>(null);
  const [wokeAt, setWokeAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      // A clock nobody is watching does not need to run.
      if (document.hidden) return;
      setNow((minute) => (minute + 1) % DAY);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SnoozeChip
        title="Ines Bardem"
        body="The yard fee on 4471-CB is still held. Can you look before the run?"
        meta="Waylight Pay ops"
        nowMinutes={now}
        onSnooze={(next) => {
          setSnooze(next);
          if (next) setWokeAt(null);
        }}
        onWake={() => {
          setSnooze(null);
          setWokeAt(now);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {snooze ? (
          <>
            <span className="text-signal">Snoozed {snooze.label}</span>
            {` · back at ${clockOf(snooze.wakeMinutes)}`}
          </>
        ) : wokeAt !== null ? (
          `Woke at ${clockOf(wokeAt)} · now ${clockOf(now)}`
        ) : (
          `Awake · now ${clockOf(now)}`
        )}
      </p>
    </div>
  );
}
