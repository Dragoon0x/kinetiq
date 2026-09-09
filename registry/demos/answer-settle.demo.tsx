"use client";

import * as React from "react";

import { AnswerSettle } from "@/registry/ui/answer-settle";

/** Fernworks Model 3 in Coldbrook Bank's back office, asked to summarise the quarter. */
const ANSWER =
  "Coldbrook closed the quarter with deposits up 4.2% and lending flat. " +
  "Most of the growth came from the Easy saver range after the rate change in May." +
  "\n\n" +
  "Card spend recovered through the last six weeks, led by travel and groceries. " +
  "Fee income followed it, though refunds ran higher than the same period last year." +
  "\n\n" +
  "The item to watch is the branch cost line, which rose for a third quarter. " +
  "A decision on the two smallest branches is due before the next review.";

/** Split at each word boundary so a token carries its own gap, blank lines included. */
const SCRIPT = ANSWER.split(/(?<=\S)(?=\s)/);
const PARAGRAPH_COUNT = ANSWER.split(/\n{2,}/).length;

/** A seeded jitter so arrivals read as a network; a blank line takes a breath. */
const DELAYS = [60, 45, 95, 55, 80, 50, 120, 70];

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function AnswerSettleDemo() {
  const [count, setCount] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [washed, setWashed] = React.useState(false);

  // A hidden tab pauses the script; the answer should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const streaming = playing && count < SCRIPT.length;

  React.useEffect(() => {
    if (!streaming || !visible) return;
    const next = SCRIPT[count] ?? "";
    const pause = next.startsWith("\n") ? 420 : 0;
    const timer = window.setTimeout(
      () => setCount((current) => current + 1),
      (DELAYS[count % DELAYS.length] ?? 60) + pause,
    );
    return () => window.clearTimeout(timer);
  }, [streaming, visible, count]);

  const text = SCRIPT.slice(0, count).join("");
  const seen = text.length === 0 ? 0 : text.split(/\n{2,}/).length;

  const status = streaming
    ? `Streaming · paragraph ${seen} of ${PARAGRAPH_COUNT}`
    : count === SCRIPT.length
      ? washed
        ? `Settled · ${PARAGRAPH_COUNT} paragraphs · washed`
        : `Settling · ${PARAGRAPH_COUNT} paragraphs`
      : "Idle · press play";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <AnswerSettle
        label="Quarter summary from Fernworks Model 3"
        model="Fernworks Model 3"
        text={text}
        streaming={streaming}
        onSettled={() => setWashed(true)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setCount(0);
            setWashed(false);
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
