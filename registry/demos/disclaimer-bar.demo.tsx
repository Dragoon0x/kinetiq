"use client";

import * as React from "react";

import { DisclaimerBar } from "@/registry/ui/disclaimer-bar";

/** Fernworks Model 3 answering Waylight Pay help questions, one at a time. */
const MODEL = "Fernworks Model 3";
const THREAD = [
  "Pots move between spaces once every member approves.",
  "A pending approval shows on the pot until everyone has answered.",
  "You can withdraw the request from the pot's menu at any point.",
];
const TEXT =
  "Fernworks Model 3 can be wrong about balances. Check figures against your statement.";

const primary =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
const quiet =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function DisclaimerBarDemo() {
  const [answers, setAnswers] = React.useState(0);
  const [pinned, setPinned] = React.useState<boolean | null>(null);
  const [peeking, setPeeking] = React.useState(false);

  const state = peeking
    ? "peeking"
    : pinned === true
      ? "pinned open"
      : pinned === false
        ? "folded by hand"
        : answers === 1
          ? "disclaimer shown"
          : "folded to a dot";
  const status =
    answers === 0 ? "No answer yet" : `Answer ${answers} · ${state}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ol className="flex flex-col gap-2">
          {THREAD.slice(0, answers).map((line, index) => (
            <li
              key={line}
              className="flex flex-col gap-1 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5"
            >
              <span className="font-mono text-[11px] text-ink-3">
                {MODEL} · answer {index + 1}
              </span>
              <p className="text-sm leading-relaxed">{line}</p>
            </li>
          ))}
        </ol>

        <DisclaimerBar
          text={TEXT}
          answers={answers}
          onOpenChange={setPinned}
          onPeekChange={setPeeking}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={answers >= THREAD.length}
          onClick={() => {
            setPinned(null);
            setAnswers((count) => Math.min(THREAD.length, count + 1));
          }}
          className={primary}
        >
          {answers === 0 ? "Ask" : "Ask again"}
        </button>
        {answers > 0 ? (
          <button
            type="button"
            onClick={() => {
              setPinned(null);
              setPeeking(false);
              setAnswers(0);
            }}
            className={quiet}
          >
            Reset
          </button>
        ) : null}
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
