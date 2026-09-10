"use client";

import * as React from "react";

import { MuteBell, type MuteDuration } from "@/registry/ui/mute-bell";

const ROWS = [
  { channel: "dispatch", topic: "Morning run, gate B" },
  { channel: "night-shift", topic: "Rota for the week" },
];

/** The countdown runs 120× so a 30-minute mute drains in fifteen seconds. */
const SPEED = 120;

export function MuteBellDemo() {
  const [mutes, setMutes] = React.useState<Record<string, MuteDuration | null>>(
    {},
  );
  const [ranOut, setRanOut] = React.useState<string | null>(null);

  const quiet = ROWS.map((row) => {
    const mute = mutes[row.channel];
    return mute ? `#${row.channel} muted · ${mute.label}` : null;
  }).filter((line): line is string => line !== null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {ROWS.map((row) => (
        <MuteBell
          key={row.channel}
          channel={row.channel}
          topic={row.topic}
          speed={SPEED}
          onMuteChange={(next) => {
            setMutes((prev) => ({ ...prev, [row.channel]: next }));
            setRanOut((prev) => (prev === row.channel ? null : prev));
          }}
          onExpire={() => {
            setMutes((prev) => ({ ...prev, [row.channel]: null }));
            setRanOut(row.channel);
          }}
        />
      ))}

      <p
        role="status"
        className="mt-2 border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {quiet.length === 0 ? "Both channels on · pick a duration" : quiet[0]}
        {quiet.length > 1 ? ` · ${quiet[1]}` : null}
        {ranOut ? (
          <span className="text-signal"> · #{ranOut} ran out</span>
        ) : null}
      </p>
    </div>
  );
}
