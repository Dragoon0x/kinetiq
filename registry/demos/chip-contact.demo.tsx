"use client";

import * as React from "react";

import {
  ChipContact,
  type ChipContactStatus,
} from "@/registry/ui/chip-contact";

/** Seeded read: six steps of a fifth each, a beat apart. */
const TICK_MS = 240;
const STEP = 0.2;

const CONTROL =
  "flex h-8 shrink-0 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ChipContactDemo() {
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [approve, setApprove] = React.useState(true);
  // The verdict a read will reach is fixed when the read starts: the armed
  // control chooses the next outcome, never rewrites a finished one.
  const [verdict, setVerdict] = React.useState(true);

  const done = progress >= 1;

  React.useEffect(() => {
    if (!running || done) return;
    let timer = 0;
    const start = () => {
      timer = window.setInterval(() => {
        setProgress((current) => Math.min(1, current + STEP));
      }, TICK_MS);
    };
    // A reader nobody is watching is not stepping a bar: the interval stops
    // with the tab and picks up where it left off when it comes back.
    const onVisibility = () => {
      window.clearInterval(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, done]);

  const status: ChipContactStatus = !running
    ? "idle"
    : progress === 0
      ? "connecting"
      : !done
        ? "reading"
        : verdict
          ? "approved"
          : "declined";

  const read = () => {
    setVerdict(approve);
    setProgress(0);
    setRunning(true);
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ChipContact
        label="Chip read"
        reader="Gaugeworks counter reader"
        status={status}
        progress={running ? progress : 0}
        onRetry={read}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={read}
          disabled={running && !done}
          className={`${CONTROL} border-hairline-strong hover:bg-accent disabled:opacity-45`}
        >
          {done ? "Read again" : "Read chip"}
        </button>
        <div
          role="radiogroup"
          aria-label="Next result"
          className="flex items-center gap-1.5"
        >
          {[
            { value: true, label: "Approve" },
            { value: false, label: "Refuse" },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={approve === option.value}
              onClick={() => setApprove(option.value)}
              className={`${CONTROL} ${
                approve === option.value
                  ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                  : "border-hairline-strong hover:bg-accent"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Chip <span className="text-cobalt-bright">{status}</span> ·{" "}
        {Math.round((running ? progress : 0) * 100)}%
      </p>
    </div>
  );
}
