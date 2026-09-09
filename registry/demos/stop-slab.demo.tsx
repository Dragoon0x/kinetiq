"use client";

import * as React from "react";

import { StopSlab, type StopSlabStatus } from "@/registry/ui/stop-slab";

const ANSWER =
  "The Basinworks plan runs three trucks on a loop that starts at the yard, takes the river road north, and turns back at the Coldbrook depot before noon. The afternoon leg covers the Fieldline farms in one pass, which saves a fourth truck and keeps every delivery inside its window.";

const WORDS = ANSWER.split(/\s+/).filter(Boolean);

/** Seeded per-word delays: a jitter from the index, and a breath at each full stop. */
const DELAYS = WORDS.map(
  (word, index) =>
    60 + ((index * 7919) % 9) * 12 + (/[.!?]$/.test(word) ? 240 : 0),
);

export function StopSlabDemo() {
  const [landed, setLanded] = React.useState(0);
  const [status, setStatus] = React.useState<StopSlabStatus>("idle");

  React.useEffect(() => {
    if (status !== "streaming" || landed >= WORDS.length) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = landed + 1;
        setLanded(next);
        if (next >= WORDS.length) setStatus("done");
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
  }, [status, landed]);

  const start = () => {
    setLanded(0);
    setStatus("streaming");
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StopSlab
        text={WORDS.slice(0, landed).join(" ")}
        status={status}
        onStop={() => setStatus("stopped")}
        onRegenerate={start}
        model="Gaugeworks Reasoner"
        label="Summary of the Basinworks route plan"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={status === "streaming"}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {status === "idle" ? "Ask" : "Ask again"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "streaming" ? (
          <>
            Streaming ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {landed} of {WORDS.length} words
            </span>
          </>
        ) : status === "stopped" ? (
          <>
            Stopped ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              kept {landed} of {WORDS.length} words
            </span>
          </>
        ) : status === "done" ? (
          <>
            Complete ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              {WORDS.length} words
            </span>
          </>
        ) : (
          <>Idle · press ask</>
        )}
      </p>
    </div>
  );
}
