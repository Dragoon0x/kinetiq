"use client";

import * as React from "react";

import { JoinToast, type Arrival } from "@/registry/ui/join-toast";

const ROSTER = [
  { name: "Rui Sequeira", note: "Invited by Marta" },
  { name: "Ines Barbosa", note: "From the Basinworks handover" },
  { name: "Nuno Peixe", note: "Night shift" },
  { name: "Lena Corvo", note: "Invited by Marta" },
  { name: "Marta Vieira", note: "Back from leave" },
];

const THREAD = [
  { id: "t1", from: "Marta", text: "Gate B is clear from nine." },
  { id: "t2", from: "Ines", text: "Two pallets left on the Friday run." },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function JoinToastDemo() {
  const [arrivals, setArrivals] = React.useState<Arrival[]>([]);
  const [seat, setSeat] = React.useState(0);
  const [joined, setJoined] = React.useState(0);
  const [held, setHeld] = React.useState(false);

  const join = (count: number) => {
    setArrivals((prev) => {
      const next = [...prev];
      for (let step = 0; step < count; step += 1) {
        const person = ROSTER[(seat + step) % ROSTER.length];
        if (!person) continue;
        next.push({
          id: `arrival-${seat + step}`,
          name: person.name,
          note: person.note,
        });
      }
      return next;
    });
    setSeat((value) => value + count);
    setJoined((value) => value + count);
  };

  const last = arrivals[arrivals.length - 1];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <JoinToast
        room="Coldbrook depot"
        arrivals={arrivals}
        onDismiss={(id) =>
          setArrivals((prev) => prev.filter((item) => item.id !== id))
        }
        onClear={() => setArrivals([])}
        onHoldChange={setHeld}
      >
        <ol
          role="list"
          aria-label="Coldbrook depot thread"
          className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
        >
          {THREAD.map((message) => (
            <li key={message.id} className="text-sm leading-snug">
              <span className="font-medium">{message.from}</span>{" "}
              <span className="text-ink-2">{message.text}</span>
            </li>
          ))}
        </ol>
      </JoinToast>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => join(1)} className={chip}>
          Someone joins
        </button>
        <button type="button" onClick={() => join(3)} className={chip}>
          Three at once
        </button>
        <button
          type="button"
          onClick={() => {
            setArrivals([]);
            setSeat(0);
            setJoined(0);
          }}
          disabled={joined === 0}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {joined === 0 ? (
          <>Nobody yet · the room is quiet</>
        ) : (
          <>
            {arrivals.length} showing · {joined} joined ·{" "}
            <span className="text-signal">
              {last ? `last ${last.name.split(" ")[0]}` : "cleared"}
            </span>
            {held ? " · held" : ""}
          </>
        )}
      </p>
    </div>
  );
}
