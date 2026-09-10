"use client";

import * as React from "react";

import { LastSeen } from "@/registry/ui/last-seen";

const SEEN_AT = "14:52";
const STEP_MS = 900;

export function LastSeenDemo() {
  const [online, setOnline] = React.useState(false);
  const [ticking, setTicking] = React.useState(false);
  const [minutesAgo, setMinutesAgo] = React.useState(4);
  const [reading, setReading] = React.useState("4 minutes ago");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 px-3 py-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-xs font-semibold text-ink-2"
        >
          IM
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">
            Ines Moreau
          </span>
          <LastSeen
            name="Ines Moreau"
            minutesAgo={minutesAgo}
            online={online}
            at={SEEN_AT}
            ticking={ticking}
            tickMs={STEP_MS}
            onWordingChange={setReading}
          />
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={online}
          onClick={() => setTicking((run) => !run)}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {ticking ? "Hold the clock" : "Let the clock run"}
        </button>
        <button
          type="button"
          onClick={() => {
            // Going offline hands the wording back at a fresh base, which is
            // the only way the count ever restarts.
            if (online) setMinutesAgo(0);
            setOnline((was) => !was);
          }}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {online ? "Ines goes offline" : "Ines comes online"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Ines Moreau —{" "}
        <span className="text-signal">
          {online ? `online since ${SEEN_AT}` : reading}
        </span>
      </p>
    </div>
  );
}
