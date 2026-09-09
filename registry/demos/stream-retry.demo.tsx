"use client";

import * as React from "react";

import { StreamRetry } from "@/registry/ui/stream-retry";

/** Fernworks Model 3 at Basinworks Exchange's help desk, on a pending withdrawal. */
const ANSWER =
  "Withdrawals to a newly added bank account wait 24 hours before they leave Basinworks. " +
  "The hold began when you added the account yesterday afternoon, so this one clears at 15:40 today. " +
  "You can cancel it until then from the pending row, and nothing is charged for the wait.";

/** Split at each word boundary so a token carries its own gap. */
const SCRIPT = ANSWER.split(/(?<=\S)(?=\s)/);

/** The first attempt drops after this many words; the retry runs to the end. */
const DROP_AT = 14;

/** A seeded jitter so the arrivals read as a network, not a metronome. */
const DELAYS = [70, 45, 110, 60, 90, 50, 130, 80];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function StreamRetryDemo() {
  const [count, setCount] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [retries, setRetries] = React.useState(0);

  // A hidden tab pauses the script; the answer should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const streaming = playing && !failed && count < SCRIPT.length;

  React.useEffect(() => {
    if (!streaming || !visible) return;
    const drops = count === DROP_AT && retries === 0;
    const timer = window.setTimeout(
      () => {
        if (drops) setFailed(true);
        else setCount((current) => current + 1);
      },
      (DELAYS[count % DELAYS.length] ?? 70) + (drops ? 200 : 0),
    );
    return () => window.clearTimeout(timer);
  }, [streaming, visible, count, retries]);

  const status = failed
    ? `Dropped at word ${count} · retry`
    : streaming
      ? retries > 0
        ? `Resumed from word ${DROP_AT} · ${count} words`
        : `Streaming · ${count} words`
      : count === SCRIPT.length
        ? `Complete · ${count} words · ${retries} ${retries === 1 ? "retry" : "retries"}`
        : "Idle · press play";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StreamRetry
        label="Answer from Fernworks Model 3"
        model="Fernworks Model 3"
        text={SCRIPT.slice(0, count).join("")}
        streaming={streaming}
        failed={failed}
        onRetry={() => {
          setFailed(false);
          setRetries((current) => current + 1);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCount(0);
            setFailed(false);
            setRetries(0);
            setPlaying(true);
          }}
          className={button}
        >
          {playing ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
