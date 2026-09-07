"use client";

import * as React from "react";

import { SaveMark, type SaveState } from "@/registry/ui/save-mark";

const DEBOUNCE_MS = 900;
const ROUND_TRIP_MS = 700;
/** The second save drops, so the error path and Retry are both reachable. */
const FLAKY_SAVE = 1;

export function SaveMarkDemo() {
  const fieldId = React.useId();
  const [text, setText] = React.useState(
    "Ridge survey — canopy line holds above the north cut.",
  );
  const [state, setState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState(0);
  // Attempts pick which round trip drops; written counts only the ones that
  // landed, which is what the status line claims.
  const [attempts, setAttempts] = React.useState(0);
  const [written, setWritten] = React.useState(0);

  // Every keystroke restarts the debounce; the cleanup is what makes it one.
  React.useEffect(() => {
    if (state !== "dirty") return;
    const timer = window.setTimeout(() => setState("saving"), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state, text]);

  React.useEffect(() => {
    if (state !== "saving") return;
    const timer = window.setTimeout(() => {
      if (attempts === FLAKY_SAVE) {
        setState("error");
      } else {
        setSavedAt(Date.now());
        setState("saved");
        setWritten((count) => count + 1);
      }
      setAttempts((count) => count + 1);
    }, ROUND_TRIP_MS);
    return () => window.clearTimeout(timer);
  }, [state, attempts]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          Fernworks field note
        </label>
        <SaveMark
          state={state}
          savedAt={savedAt}
          onRetry={() => setState("saving")}
        />
      </div>

      <textarea
        id={fieldId}
        rows={4}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setState("dirty");
        }}
        className="w-full resize-none rounded-2 border border-input bg-surface-1 p-3 text-sm leading-relaxed outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Autosave · <span className="text-signal">{state}</span> ·{" "}
        <span className="tabular-nums">{written}</span> written
      </p>
    </div>
  );
}
