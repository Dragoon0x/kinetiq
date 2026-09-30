"use client";

import * as React from "react";

import { ReleaseNotes, type ReleaseCommit } from "@/registry/ui/release-notes";

/** Waylight Pay's ledger-api 2.14.0, ten seeded commits in landing order. */
const SCRIPT: ReleaseCommit[] = (
  [
    ["c1", "added", "holds", "Hold receipts carry the yard's clock"],
    ["c2", "fixed", "settle", "Retry the settle when the gate refuses once"],
    ["c3", "changed", "api", "Hold ids are twelve characters, not eight"],
    ["c4", "added", "queue", "dock-worker reports its own queue depth"],
    ["c5", "fixed", "ledger", "Round the fee to the cent before it is written"],
    ["c6", "removed", "api", "Drop the old holds route"],
    ["c7", "changed", "gate-relay", "Health checks answer on readyz"],
    ["c8", "fixed", "holds", "Refuse a hold the ledger has already closed"],
    ["c9", "added", "notes", "Release notes ship with the deploy"],
    ["c10", "removed", "queue", "Drop the unused retry budget field"],
  ] as [id: string, kind: ReleaseCommit["kind"], scope: string, text: string][]
).map(([id, kind, scope, text]) => ({ id, kind, scope, text }));

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ReleaseNotesDemo() {
  const [landed, setLanded] = React.useState(3);
  const [running, setRunning] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const [edits, setEdits] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A hidden tab throttles timers, so the note holds where it is rather than
  // landing five commits at once when it comes back.
  React.useEffect(() => {
    if (!running || hidden || landed >= SCRIPT.length) return;
    const timer = window.setTimeout(
      () => setLanded((count) => Math.min(SCRIPT.length, count + 1)),
      900,
    );
    return () => window.clearTimeout(timer);
  }, [running, hidden, landed]);

  const commits = SCRIPT.slice(0, landed);
  const groups = new Set(commits.map((commit) => commit.kind)).size;
  const editedCount = Object.keys(edits).length;
  const atEnd = landed >= SCRIPT.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReleaseNotes
        service="ledger-api"
        version="2.14.0"
        dateLabel="cut on day 214"
        commits={commits}
        edits={edits}
        onEditsChange={setEdits}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            if (!running && atEnd) setLanded(0);
            setRunning(!running);
          }}
        >
          {running ? "Pause" : atEnd ? "Write it again" : "Write it"}
        </button>
        <button
          type="button"
          className={chip}
          disabled={atEnd}
          onClick={() =>
            setLanded((count) => Math.min(SCRIPT.length, count + 1))
          }
        >
          Land commit
        </button>
        <button
          type="button"
          className={chip}
          disabled={landed === 0 && editedCount === 0}
          onClick={() => {
            setRunning(false);
            setLanded(0);
            setEdits({});
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">2.14.0</span>
        {` · ${landed} of ${SCRIPT.length} commits · ${groups} ${groups === 1 ? "group" : "groups"}`}
        {editedCount > 0 ? ` · ${editedCount} edited` : ""}
      </p>
    </div>
  );
}
