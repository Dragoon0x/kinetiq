"use client";

import * as React from "react";

import { QueueNumber } from "@/registry/ui/queue-number";

const START = 42;
const TICKET = 47;
const AUTO_MS = 2500;

const ticketOf = (value: number) => `A-${String(value).padStart(3, "0")}`;

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const BUTTON =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function QueueNumberDemo() {
  const [serving, setServing] = React.useState(START);
  const [auto, setAuto] = React.useState(false);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const called = serving === TICKET;
  const passed = serving > TICKET;

  // The branch calls the next number on its own until it reaches ours, and
  // only while the tab is showing.
  React.useEffect(() => {
    if (!auto || !visible || serving >= TICKET) return;
    const timer = window.setTimeout(
      () => setServing((current) => current + 1),
      AUTO_MS,
    );
    return () => window.clearTimeout(timer);
  }, [auto, visible, serving]);

  const reset = () => {
    setAuto(false);
    setServing(START);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <QueueNumber
        label="Coldbrook Bank · Counter 3"
        serving={serving}
        ticket={TICKET}
        secondsPerTicket={75}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={reset} className={BUTTON}>
          Reset
        </button>
        <button
          type="button"
          aria-pressed={auto}
          disabled={serving >= TICKET}
          onClick={() => setAuto((on) => !on)}
          className={BUTTON}
        >
          {auto ? "Auto on" : "Auto"}
        </button>
        <button
          type="button"
          disabled={passed}
          onClick={() => setServing((current) => current + 1)}
          className={BUTTON}
        >
          Next
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {called ? (
          <span className="text-cobalt-bright tabular-nums">
            Your turn · {ticketOf(TICKET)}
          </span>
        ) : passed ? (
          <span className="tabular-nums">
            Called earlier · {ticketOf(TICKET)}
          </span>
        ) : (
          <>
            Serving{" "}
            <span className="text-cobalt-bright tabular-nums">
              {ticketOf(serving)}
            </span>{" "}
            · yours <span className="tabular-nums">{ticketOf(TICKET)}</span> ·{" "}
            {TICKET - serving - 1 === 0
              ? "next"
              : `${TICKET - serving - 1} before you`}
          </>
        )}
      </p>
    </div>
  );
}
