"use client";

import * as React from "react";

import { CountdownCard } from "@/registry/ui/countdown-card";

/** The seeded span: one minute twenty-four, so the minutes column rolls once. */
const SPAN = 84;

const clock = (total: number) => {
  const whole = Math.max(0, Math.ceil(total));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(
    whole % 60,
  ).padStart(2, "0")}`;
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function CountdownCardDemo() {
  const [span, setSpan] = React.useState(SPAN);
  const [running, setRunning] = React.useState(false);
  const [left, setLeft] = React.useState(SPAN);
  const [open, setOpen] = React.useState(false);

  const restart = (next: number, run: boolean) => {
    // Changing the span is the card's reset: the run remounts and starts over.
    setSpan(next);
    setLeft(next);
    setOpen(false);
    setRunning(run);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CountdownCard
        label="Basinworks yard thread"
        peerName="Marta"
        seconds={span}
        running={running && !open}
        onRemainingChange={setLeft}
        onReached={() => {
          setOpen(true);
          setRunning(false);
        }}
        event={{
          id: "countdown-1",
          from: "peer",
          title: "Bay four opens",
          opensLine: "Doors are open at bay four",
          where: "Basinworks yard, bay four",
          time: "09:12",
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={open}
          onClick={() => setRunning((prev) => !prev)}
        >
          {running ? "Hold" : "Start"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={span === 5}
          onClick={() => restart(5, true)}
        >
          Jump to five seconds
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => restart(SPAN, false)}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            <span className="text-[var(--signal,var(--primary))]">
              doors open
            </span>{" "}
            · bay four
          </>
        ) : (
          <>
            <span className="text-[var(--signal,var(--primary))]">
              {running ? "running" : "held"}
            </span>{" "}
            · {clock(left)} left
          </>
        )}
      </p>
    </div>
  );
}
