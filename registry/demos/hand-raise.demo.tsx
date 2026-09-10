"use client";

import * as React from "react";

import { HandRaise, type RaisedHand } from "@/registry/ui/hand-raise";

const ROOM: RaisedHand[] = [
  { id: "marta", name: "Marta Reis" },
  { id: "rui", name: "Rui Alvez" },
  { id: "dana", name: "Dana Ferro" },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function HandRaiseDemo() {
  const [queue, setQueue] = React.useState<RaisedHand[]>(() =>
    ROOM.slice(0, 2),
  );
  const [raised, setRaised] = React.useState(false);
  const [position, setPosition] = React.useState(0);

  const next = ROOM.find((hand) => !queue.some((held) => held.id === hand.id));

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HandRaise
        queue={queue}
        raised={raised}
        onRaisedChange={setRaised}
        onPositionChange={setPosition}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!next}
          onClick={() => {
            if (next) setQueue((held) => [...held, next]);
          }}
          className={chip}
        >
          {next ? `${next.name} raises` : "Everyone is up"}
        </button>
        <button
          type="button"
          disabled={queue.length === 0}
          onClick={() => setQueue((held) => held.slice(1))}
          className={chip}
        >
          Call the first hand
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {raised ? `You are number ${position} in line` : "Hand down"}
        </span>{" "}
        · {queue.length + (raised ? 1 : 0)} raised
      </p>
    </div>
  );
}
