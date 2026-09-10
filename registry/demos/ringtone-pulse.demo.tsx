"use client";

import * as React from "react";

import {
  RingtonePulse,
  type RingtoneStatus,
} from "@/registry/ui/ringtone-pulse";

const control =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-ink-3";

export function RingtonePulseDemo() {
  const [status, setStatus] = React.useState<RingtoneStatus>("ringing");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RingtonePulse
        callerName="Ines Moreau"
        roomName="Coldbrook dispatch"
        status={status}
        onStatusChange={setStatus}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatus("ringing")}
          disabled={status === "ringing"}
          className={control}
        >
          Call again
        </button>
        <button
          type="button"
          onClick={() => setStatus("missed")}
          disabled={status !== "ringing"}
          className={control}
        >
          They give up
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span> · ines moreau · coldbrook
        dispatch
      </p>
    </div>
  );
}
