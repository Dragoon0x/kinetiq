"use client";

import * as React from "react";

import { OnlineCount } from "@/registry/ui/online-count";

const ROSTER = [
  "Marta Vieira",
  "Rui Sequeira",
  "Ines Barbosa",
  "Nuno Peixe",
  "Lena Corvo",
  "Tomas Reis",
  "Ana Bexiga",
  "Vasco Lima",
];

const SEED_NAMES = ROSTER.slice(0, 6);
/** A seeded hour: twelve five-minute samples ending where the room stands. */
const SEED_HISTORY = [4, 5, 5, 6, 5, 6, 7, 6, 6, 5, 6, 6];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function OnlineCountDemo() {
  const [names, setNames] = React.useState<string[]>(SEED_NAMES);
  const [history, setHistory] = React.useState<number[]>(SEED_HISTORY);
  const [delta, setDelta] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const move = (next: string[]) => {
    setNames(next);
    setHistory((prev) => [...prev.slice(-23), next.length]);
  };

  const join = () => {
    const next = ROSTER.find((name) => !names.includes(name));
    if (next) move([...names, next]);
  };

  const leave = () => {
    if (names.length > 0) move(names.slice(0, -1));
  };

  const window12 = history.slice(-12);
  const low = window12.length > 0 ? Math.min(...window12) : names.length;
  const high = window12.length > 0 ? Math.max(...window12) : names.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <OnlineCount
        label="Coldbrook depot"
        names={names}
        history={history}
        open={open}
        onOpenChange={setOpen}
        onCountChange={(_, step) => setDelta(step)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={join}
          disabled={names.length >= ROSTER.length}
          className={chip}
        >
          Someone joins
        </button>
        <button
          type="button"
          onClick={leave}
          disabled={names.length === 0}
          className={chip}
        >
          Someone leaves
        </button>
        <button
          type="button"
          onClick={() => {
            setNames(SEED_NAMES);
            setHistory(SEED_HISTORY);
            setDelta(0);
          }}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {names.length} here ·{" "}
        <span className="text-signal">
          {delta > 0 ? `up ${delta}` : delta < 0 ? `down ${-delta}` : "steady"}
        </span>{" "}
        · hour {low}–{high}
        {open ? " · names open" : ""}
      </p>
    </div>
  );
}
