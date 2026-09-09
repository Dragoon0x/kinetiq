"use client";

import * as React from "react";

import { TokenStream } from "@/registry/ui/token-stream";

/** Fernworks Model 3 answering a Waylight Pay help question, one token at a time. */
const ANSWER =
  "Open the pot you want to share and choose Move to a space. " +
  "Waylight asks every member of that space to approve the move before the balance leaves your account. " +
  "Until they all approve, the pot stays where it is and keeps earning.";

/** Split before each space so every token carries its own leading gap. */
const SCRIPT = ANSWER.split(/(?=\s)/);

/** A seeded jitter so the arrivals read as a network, not a metronome. */
const DELAYS = [70, 40, 110, 60, 90, 50, 140, 80];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function TokenStreamDemo() {
  const [count, setCount] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [stopped, setStopped] = React.useState(false);

  // A hidden tab pauses the script; the answer should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const streaming = playing && !stopped && count < SCRIPT.length;

  React.useEffect(() => {
    if (!streaming || !visible) return;
    const timer = window.setTimeout(
      () => setCount((current) => current + 1),
      DELAYS[count % DELAYS.length],
    );
    return () => window.clearTimeout(timer);
  }, [streaming, visible, count]);

  const replay = () => {
    setCount(0);
    setStopped(false);
    setPlaying(true);
  };

  const status = streaming
    ? `Streaming · ${count} tokens`
    : stopped
      ? `Stopped · ${count} of ${SCRIPT.length} tokens`
      : count === SCRIPT.length
        ? `Complete · ${count} tokens`
        : "Idle · press play";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TokenStream
        label="Answer from Fernworks Model 3"
        model="Fernworks Model 3"
        chunks={SCRIPT.slice(0, count)}
        streaming={streaming}
        stopped={stopped}
        onStop={() => setStopped(true)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={replay} className={button}>
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
