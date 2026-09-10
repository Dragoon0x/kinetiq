"use client";

import * as React from "react";

import { CallBar, type CallState } from "@/registry/ui/call-bar";

const IN_THE_ROOM = ["Marta Reis", "Rui Alvez"];

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CallBarDemo() {
  const [state, setState] = React.useState<CallState>("none");
  const [seconds, setSeconds] = React.useState(0);
  const [lastRun, setLastRun] = React.useState<number | null>(null);

  const inRoom = IN_THE_ROOM.length + (state === "joined" ? 1 : 0);

  const status =
    state === "joined"
      ? `Joined · ${clock(seconds)} · ${inRoom} in the room`
      : state === "ringing"
        ? `Ringing · ${inRoom} in the room`
        : lastRun === null
          ? "No call"
          : `Left after ${clock(lastRun)}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CallBar
        title="Coldbrook depot"
        participants={IN_THE_ROOM}
        state={state}
        onStateChange={setState}
        onElapsedChange={setSeconds}
        onLeave={(run) => setLastRun(run)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSeconds(0);
            setLastRun(null);
            setState("ringing");
          }}
          disabled={state !== "none"}
          className={chip}
        >
          Ring the room
        </button>
        <button
          type="button"
          onClick={() => setState("none")}
          disabled={state === "none"}
          className={chip}
        >
          End the call
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{status}</span>
      </p>
    </div>
  );
}
