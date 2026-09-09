"use client";

import * as React from "react";

import { CursorLead } from "@/registry/ui/cursor-lead";

const ANSWER =
  "The Tuesday night window is the one to take. Its slots hold under minus twelve for six straight hours, which is long enough to churn the pistachio and let it set before the morning delivery run leaves. Thursday runs colder but breaks twice, and a broken churn costs a whole batch.";

const WORDS = ANSWER.split(/\s+/).filter(Boolean);

/** Seeded per-word delays: a jitter from the index, and a breath at each full stop. */
const DELAYS = WORDS.map(
  (word, index) =>
    55 + ((index * 7919) % 9) * 12 + (/[.!?]$/.test(word) ? 260 : 0),
);

export function CursorLeadDemo() {
  const [landed, setLanded] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    if (!playing || landed >= WORDS.length) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = landed + 1;
        setLanded(next);
        if (next >= WORDS.length) setPlaying(false);
      }, DELAYS[landed]);
    };
    // A hidden tab holds the stream where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, landed]);

  const start = () => {
    setLanded(0);
    setPlaying(true);
  };

  const sentences = WORDS.filter((word) => /[.!?]$/.test(word)).length;
  const settled = landed >= WORDS.length && !playing;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <CursorLead
        text={ANSWER}
        landed={landed}
        playing={playing}
        model="Fernworks Model 3"
        label="Answer about the churn window"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {landed > 0 ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {playing ? (
          <>
            Streaming{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {landed} / {WORDS.length} words
            </span>{" "}
            · caret leading
          </>
        ) : settled ? (
          <>
            Settled{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {WORDS.length} words
            </span>{" "}
            · {sentences} sentences
          </>
        ) : (
          <>Waiting · press play</>
        )}
      </p>
    </div>
  );
}
