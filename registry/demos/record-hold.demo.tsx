"use client";

import * as React from "react";

import { RecordHold } from "@/registry/ui/record-hold";

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function RecordHoldDemo() {
  const [live, setLive] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [outcome, setOutcome] = React.useState("Idle");

  React.useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [live]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-semibold text-foreground">
            Basinworks · site notes
          </span>
          <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            Max 0:30
          </span>
        </div>

        <RecordHold
          maxSeconds={30}
          cancelDistance={96}
          onRecord={(event, seconds) => {
            if (event === "start") {
              setLive(true);
              setElapsed(0);
              setOutcome("Recording");
              return;
            }
            setLive(false);
            setOutcome(
              event === "stop" ? `Sent ${clock(seconds)}` : "Cancelled",
            );
          }}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {live ? `Recording ${clock(elapsed)}` : outcome}
        </span>
        {live ? " · slide left to cancel" : " · hold the mic"}
      </p>
    </div>
  );
}
